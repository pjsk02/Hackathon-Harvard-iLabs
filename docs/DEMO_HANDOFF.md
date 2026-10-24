# Envoi — current demo handoff

This is the single source for the stage flow and spoken demo. Use the repo's
`.agents/skills/envoi-ui/SKILL.md` with the existing light theme. Current user
instructions here and in `replit.md` override older mock, timing and key examples.
The shared API contract remains `shared/contract.ts`.

## 1. The story and its limits

**Grant → Clean example → Injected example → Monad evidence.**

JT Morgan is the data owner. Baine's research agent, Atlas, can request regional
branch profitability but not employee compensation. A deterministic bouncer,
not the model or browser, decides whether each request is allowed.

- Baine and JT Morgan are fictional; the screen says so.
- Nothing in the demo may use a simulated chain or scripted AI response.
- Grant must return a real signature and recorded permission before examples run.
- A permission's public-record link is **not** proof that an agent attempt was
  recorded. Until attempt-specific evidence is implemented, requests are labeled
  application records, not Monad records. The requested full demo is incomplete
  until that integration lands.
- Only returned allowed receipt data may populate the results table. No protected
  dataset belongs in the browser bundle.
- An outage is an error, never a successful rejection or proof of late permission.
- No elapsed-time bracket or timer is required.

## 2. Ownership and integration

| Owner | Scope |
| --- | --- |
| Aman / P1 | `server/chain/**`, `server/routes/slips.ts`: signing, recorded permission, dispute evidence |
| Jay / P2 | Agent, bouncer, protected data, act/agent/self-test routes |
| Rachel / P3 | `client/**`, state and state routes, route mounting, demo documentation |
| Team agreement | Changes to `shared/contract.ts`, including attempt-specific evidence |

Do not overwrite another owner's implementation. P1's branch is
`p1/signing-and-dispute-evidence`; reviewing or running its offline tests is not
the same as merging it or proving this app works live. Integration findings are
in [P1 integration review](P1_INTEGRATION_REVIEW.md).

P2 should identify Atlas as Baine's research assistant working on JT Morgan's
review, give it the actual supplied report, and expose the existing two tools.
Document content is untrusted. Do not force a predetermined tool choice or call
a scripted response live AI.

For precise upload and reset requirements see
[team integration handoff](TEAM_ASKS_LIVE_AI_AND_MONAD.md).

## 3. Stage layout and controls

The existing three-column screen stays: **Baine / Atlas · Monad evidence ·
JT Morgan / bouncer**. Keep the current porcelain, navy and lavender palette,
typography, logo and layout. Do not introduce a new dashboard or scenario picker.

| Key | Control | Behavior |
| --- | --- | --- |
| **1** | Grant | `POST /api/slips`; only before an original permission exists |
| **2** | Clean example | `POST /api/agent/run {reportId:"clean"}` after Grant |
| **3** | Injected example | Runs the retained uploaded report, or the built-in injected report, after the clean example |
| **4** | Monad evidence | Focuses the evidence already returned by the server; no new write |
| **R** | Open report / Show hidden text / Close report | Local preview only |
| **5** | Force request — optional | Calls `/api/act`; clearly marked forced, never attributed to the model |
| **6** | Dispute — optional | Calls `/api/dispute` after an eligible blocked request |
| **0** | Reset | Requires a second press; resets application state, not the public chain |
| **V** | Classic view | Alternate layout using the same real APIs and recovery guard |

Shortcuts ignore typing fields, held keys and modifier combinations. Controls
are disabled while work is in flight. With two returned receipts, retain the
allowed table and put the blocked decision in front. Show every failed check.
Respect reduced motion and keep stamps readable at 1440×900 with 125% zoom.

Use “permission slip,” “bouncer,” “stamp” and “public record.” Avoid protocol
jargon in rendered text. Failed checks must retain their actual cause.

## 4. Report upload

1. Use the sample link below the chat box to download
   `JT-Morgan-Q3-Data-Request.docx`, then upload that file during the demo.
2. The sample is a demo variant of the supplied report: its assistant note uses
   white 1pt text. The original supplied Word file had a visible highlighted note.
3. The preview initially hides supported hidden formatting. **R** or **Show
   hidden text** reveals it. Hidden text remains in the extracted request body.
4. Running the clean example does not discard the uploaded injected report.
5. Step 3 sends `{reportId:"poisoned", upload:{fileName,text}}`. The server must
   validate this input and pass `text` to Claude; browser extraction alone is not
   evidence that Claude consumed it.

Accepted: `.docx`, `.txt`, `.md`, `.html`, `.htm`; maximum 5 MB and 60,000 extracted
characters. Empty, corrupt, unsupported and oversized inputs fail visibly.
PDF is not supported. HTML is parsed as text, not executed as uploaded markup.

## 5. Readiness and recovery

- **Check status** reads health and current application state only. It does not
  sign, resubmit, run the model or run the self-test.
- “Server responded” does not verify the signer, Monad connection or live AI.
- Request failures stay visible beside Grant. Reads have a 15-second deadline;
  actions have a 90-second client deadline. Neither deadline cancels server or
  chain work.
- Lost, unreadable or ambiguous write responses remain unconfirmed. Never
  automatically retry. This recovery state survives a page reload in the same tab.
- A returned recorded original permission can resolve an uncertain Grant.
  An empty state response cannot prove an earlier action was cancelled.
- Other uncertain actions stay guarded until a confirmed Reset or a future
  authoritative operation-status interface. Reset does not erase existing Monad
  records; do not use it to conceal unresolved chain activity.
- `/?preflight=1` exposes configuration and the manual self-test. The self-test
  may create real records or change the session; it is never run automatically.

## 6. Spoken demo

The presentation may introduce blockchain-backed agent controls first. Then:

| Beat | Driver | Speaker |
| --- | --- | --- |
| Grant | **1**, wait for real recorded permission | “JT Morgan gives Atlas permission to read regional profitability, not employee compensation. The permission is signed and recorded on Monad, so both companies can check it.” |
| Clean | **2**, wait for returned result | “First, a normal report. Atlas requests profitability. The bouncer checks the permission, allows the request, and returns these results.” |
| Injected | Upload the Word sample, **R** to reveal, then **3** | “Now the report contains hidden instructions asking for compensation. Watch what Atlas actually requests. The bouncer checks the same permission; compensation is outside its scope.” |
| Evidence | **4**, open the genuine permission link | “Here is the recorded permission, and here are the actual requests and decisions. Each on-chain claim needs its own public record.” |

If Atlas does not request compensation, say so. The optional **5 Force request**
can demonstrate enforcement, but explicitly call it a forced request. Do not
claim the model was fooled when it was not.

Once per-attempt recording is integrated, the final beat can open each attempt's
own link. Until then, describe those rows only as application history.

Optional dispute: **6** after a qualifying block. Explain that a broader,
genuinely signed permission was added after the original request. Say “added
after the request,” not “forged,” and show REJECTED only if the server established
that cause. A blocked request is not a leak.

## 7. Verification and rehearsal

1. Run `npm run typecheck`, `npm test`, `npm run test:ui`, `npm run build`.
   Browser tests use isolated responses and do not submit real actions.
2. After P1/P2 integration, run the real flow and verify actual signatures,
   explorer records, upload consumption and failure paths.
3. Publish only after live acceptance, then verify the published URL separately.
   Workspace-only credentials do not establish production readiness.
4. Rehearse the Grant-first script on the published app and record a backup of
   that genuine run. Clearly identify a recording if it is used.
5. If Grant or evidence fails, stop and explain the problem; no mock or scripted
   replacement is an acceptable fallback.

The detailed implementation/verification boundary is in
[P3 acceptance](P3_ACCEPTANCE.md). Runnable test instructions are in
[P3 testing](P3_TESTING.md).
