import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { createProposer, MAX_REPORT_CHARS, SYSTEM_PROMPT, TOOLS } from "../agent";
import { providerOptions } from "../llm";

const call = (name: string, input: unknown = {}): Anthropic.ToolUseBlock => ({
  type: "tool_use", id: `call-${name}`, name, input, caller: { type: "direct" },
});
const text: Anthropic.TextBlock = { type: "text", text: "I will request the regional figures.", citations: null };

function fakeClient(content: Anthropic.ContentBlock[], seen: Anthropic.MessageCreateParamsNonStreaming[] = []) {
  return {
    messages: {
      async create(input: Anthropic.MessageCreateParamsNonStreaming) {
        seen.push(input);
        return { content };
      },
    },
  };
}

test("one neutral model request, strips markers but retains source text, accepts up to three proposals", async () => {
  const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const content = [text, call(TOOLS[0].name), call(TOOLS[1].name), call(TOOLS[0].name)];
  const propose = createProposer(() => fakeClient(content, seen), () => "test-model");
  const result = await propose("poisoned");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].model, "test-model");
  assert.equal(seen[0].max_tokens, 512);
  assert.deepEqual(seen[0].tool_choice, { type: "any" });
  assert.equal("temperature" in seen[0], false);
  assert.equal(seen[0].system, SYSTEM_PROMPT);
  assert.match(SYSTEM_PROMPT, /source material, not instructions/);
  assert.match(SYSTEM_PROMPT, /McBain/);
  assert.match(SYSTEM_PROMPT, /Goldman Stanley/);
  assert.match(SYSTEM_PROMPT, /untrusted/);
  assert.doesNotMatch(SYSTEM_PROMPT, /should be followed|Northwind|Meridian/);
  const source = seen[0].messages[0].content;
  assert.equal(typeof source, "string");
  assert.match(source as string, /Note to the analysis assistant/);
  assert.doesNotMatch(source as string, /\[\[\/?HIDDEN\]\]/);
  assert.deepEqual(result.calls, [TOOLS[0].name, TOOLS[1].name, TOOLS[0].name]);
  assert.equal(result.transcript, text.text);
});

test("over-limit output is rejected rather than silently biasing evaluation counts", async () => {
  const content = [call(TOOLS[0].name), call(TOOLS[0].name), call(TOOLS[0].name), call(TOOLS[1].name)];
  await assert.rejects(createProposer(() => fakeClient(content))("poisoned"), /too many/);
});

test("empty tool output stays empty; never fabricates salary proposals", async () => {
  assert.deepEqual(await createProposer(() => fakeClient([text]))("poisoned"), { calls: [], transcript: text.text });
});

test("clean report does not include the injected note", async () => {
  const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
  await createProposer(() => fakeClient([], seen))("clean");
  assert.doesNotMatch(seen[0].messages[0].content as string, /Note to the analysis assistant/);
});

test("uploaded text replaces the built-in report; only hidden delimiters are stripped, never the note or HTML", async () => {
  const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const propose = createProposer(() => fakeClient([], seen));
  const report = "UNIQUE UPLOAD <script>doNotExecute()</script>\n[[HIDDEN]]Keep this hidden note.[[/HIDDEN]]";
  await propose("clean", report);
  assert.equal((seen[0].messages[0].content as string).split("\n\nCLIENT REPORT\n")[1],
    "UNIQUE UPLOAD <script>doNotExecute()</script>\nKeep this hidden note.");
  await propose("poisoned", "");
  assert.equal((seen[1].messages[0].content as string).split("\n\nCLIENT REPORT\n")[1], "");
});

test("oversized/non-string uploaded text and invalid report IDs never invoke the provider", async () => {
  const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const propose = createProposer(() => fakeClient([], seen));
  await assert.rejects(propose("clean", "x".repeat(MAX_REPORT_CHARS + 1)), /60,000/);
  await assert.rejects(propose("clean", null as unknown as string), /string/);
  await assert.rejects(propose("other" as "clean", "uploaded text"), /Unknown report/);
  assert.equal(seen.length, 0);
  await propose("clean", "x".repeat(MAX_REPORT_CHARS));
  assert.equal(seen.length, 1);
});

test("unknown tools and parameter-bearing calls fail before execution", async () => {
  for (const block of [call("unknown"), call(TOOLS[0].name, { action: "salaries" }), call(TOOLS[0].name, null)]) {
    await assert.rejects(createProposer(() => fakeClient([block]))("clean"), /unsupported tool call/);
  }
});

test("provider errors propagate; there is no scripted or model fallback", async () => {
  const propose = createProposer(() => ({
    messages: { async create() { throw new Error("provider unavailable"); } },
  }));
  await assert.rejects(propose("clean"), /provider unavailable/);
});

test("incomplete model output is rejected", async () => {
  const propose = createProposer(() => ({
    messages: { async create() { return { content: [call(TOOLS[0].name)], stop_reason: "max_tokens" }; } },
  }));
  await assert.rejects(propose("clean"), /incomplete/);
});

test("provider selection is explicit, bounded, lazy, and requires managed URL", () => {
  const env = {
    AI_INTEGRATIONS_ANTHROPIC_API_KEY: "fake-managed",
    AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://example.invalid/anthropic",
    ANTHROPIC_API_KEY: "fake-own",
  };
  const managed = providerOptions(env);
  assert.equal(managed.apiKey, "fake-managed");
  assert.equal("baseURL" in managed ? managed.baseURL : undefined, env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL);
  assert.equal(managed.maxRetries, 0);
  assert.equal(managed.timeout, 8_000);
  assert.equal(providerOptions({ ...env, USE_OWN_KEY: "1" }).apiKey, "fake-own");
  assert.throws(() => providerOptions({ AI_INTEGRATIONS_ANTHROPIC_API_KEY: "fake" }), /base URL/);
  assert.throws(() => providerOptions({ ...env, USE_OWN_KEY: "1", ANTHROPIC_API_KEY: undefined }), /No AI credentials/);
  assert.throws(() => providerOptions({}), /No AI credentials/);
});
