import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AtlasReply,replyUrl } from "../src/split/AtlasReply";

const render=(text:string)=>renderToStaticMarkup(createElement(AtlasReply,{text}));
test("Atlas replies render emphasis, lists, headings, tables and code semantically",()=>{
  const html=render("## Findings\n\n**Bold result** with *emphasis*.\n\n1. First\n2. Second\n\n- Nested review\n\n| Region | Review |\n| --- | --- |\n| Fictional | Ready |\n\n```js\nconst review = true;\n```\n\n> Evidence first");
  for(const element of ["h2","strong","em","ol","ul","table","code","blockquote"])assert.match(html,new RegExp(`<${element}[ >]`));
  assert.match(html,/reply-scroll/);assert.doesNotMatch(html,/\*\*Bold/);
});
test("untrusted replies cannot render HTML, scripts, remote images or unsafe links",()=>{
  const html=render('<script>alert(1)</script>\n\n<img src="https://tracker.invalid/pixel">\n\n![Tracking](https://tracker.invalid/pixel)\n\n[bad](javascript:alert%281%29) [file](file:///secret) [data](data:text/html,test) [safe](https://example.com/report)');
  assert.doesNotMatch(html,/<(?:script|img|iframe)|href="(?:javascript|file|data):|src=/i);
  assert.match(html,/Image omitted: Tracking/);assert.match(html,/href="https:\/\/example.com\/report"/);
  assert.match(html,/rel="noopener noreferrer nofollow"/);assert.match(html,/target="_blank"/);
  for(const value of ["javascript:alert(1)","//tracker.invalid", "/local", "data:text/html,a", "https://name:secret@example.com"])assert.equal(replyUrl(value),undefined);
});
test("plain text and unfinished Markdown stay readable without changing saved text",()=>{
  for(const text of ["A normal answer.\nAnother line.","**Unfinished thought", "| Partial | table\n\n```js\nunfinished()"]){
    const copy=text;assert.ok(render(text).length);assert.equal(text,copy);
  }
});
