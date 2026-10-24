import { test,before,after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer,{type Browser,type Page} from "puppeteer-core";
import { EXAMPLES,CASE_PARTIES,type CaseSummary,type BoardResponse,type CaseDetail } from "../../shared/transactions";
import type { WorkspaceResponse } from "../../shared/workspace";

let browser:Browser;
const base=process.env.UI_BASE_URL ?? "http://127.0.0.1:5000";
const caseId="10000000-0000-4000-8000-000000000001";
before(async()=>{const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH??["/repl/tools/bin/chromium","/usr/bin/chromium"].find(existsSync);assert.ok(executablePath);browser=await puppeteer.launch({executablePath,args:["--no-sandbox","--disable-dev-shm-usage"]});});
after(async()=>{await browser?.close();});
async function click(page:Page,text:string){await page.evaluate(text=>{const button=[...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent===text);if(!button||button.disabled)throw new Error(`No enabled button: ${text}`);button.click();},text);await page.waitForNetworkIdle({idleTime:100});}
async function fixture(path="/"){
  const context=await browser.createBrowserContext(),page=await context.newPage();
  const now=new Date().toISOString();
  const board:BoardResponse={activeId:null,cases:EXAMPLES.map(item=>({...item,provenance:"example",revision:0,createdAt:now,updatedAt:now,parties:CASE_PARTIES[item.scenario],pending:false,decisions:[]}))};
  const state:WorkspaceResponse={generation:0,draft:{permissions:["read_regional_margins"],task:"",report:null},conversations:[],slips:[],receipts:[],operations:[],availability:{signing:false,agent:false,chat:true,detail:"Offline fixture. Live transactions paused."}};
  const calls:{path:string;method:string;body:any}[]=[],external:string[]=[],errors:string[]=[];
  const settings={unavailable:false};
  page.on("pageerror",error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request",async request=>{
    const url=new URL(request.url());
    if(url.origin!==new URL(base).origin && !url.protocol.startsWith("data")){external.push(request.url());await request.abort();return;}
    if(!url.pathname.startsWith("/api/")){await request.continue();return;}
    const body=request.postData()?JSON.parse(request.postData()!):null;calls.push({path:url.pathname,method:request.method(),body});
    const respond=(body:unknown,status=200)=>request.respond({status,contentType:"application/json",body:JSON.stringify(body)});
    if(settings.unavailable){await respond({error:"Durable storage is unavailable."},503);return;}
    if(url.pathname==="/api/workspace/transactions"){
      if(request.method()==="GET"){await respond(board);return;}
      board.activeId=caseId;
      const item:CaseSummary={id:caseId,title:body.title,scenario:"consulting",provenance:"workspace",status:"open",revision:0,createdAt:now,updatedAt:now,parties:CASE_PARTIES.consulting,pending:false,decisions:[]};
      board.cases.push(item);state.currentTransaction={...item,conversationIds:[],permissionIds:[],operationIds:[],receiptIds:[]};
      await respond({...board,createdId:caseId});return;
    }
    if(url.pathname.startsWith("/api/workspace/transactions/")){
      const id=url.pathname.split("/")[4],item=board.cases.find(c=>c.id===id)!;
      if(request.method()==="POST"){item.status=body.status;item.revision++;}
      const detail:CaseDetail={...item,timeline:[{at:now,title:"Illustrative review",detail:"No evidence has been sent and no bank outcome is claimed."}],records:[],checklist:item.scenario==="chargeback"?["Order confirmation","Payment-authorization evidence","Delivery confirmation","Merchant–customer correspondence","Await issuing-bank review"]:[],conversationCount:0};
      await respond(detail);return;
    }
    if(url.pathname==="/api/workspace"){await respond(state);return;}
    if(url.pathname==="/api/workspace/draft"){state.draft=body;await respond({ok:true});return;}
    if(url.pathname==="/api/workspace/submit"){
      const id=`chat-${state.conversations.length}`;
      state.conversations.push({id,mode:body.mode,task:body.task,report:body.report,permissionId:"",createdAt:now,transcript:"**Fresh answer**\n\n1. First item\n2. Second item",receiptIds:[],status:"complete"});state.currentTransaction?.conversationIds.push(id);
      await respond({...state,submissionId:id});return;
    }
    await respond({error:"Unexpected fixture API"},404);
  });
  await page.goto(new URL(path,base).href,{waitUntil:"networkidle0"});
  return {context,page,board,state,calls,external,errors,settings};
}
test("landing renders two labeled examples, filters scenarios and opens accessible details on desktop and mobile",async()=>{
  const h=await fixture();try{
    assert.equal(await h.page.$$(".case-card").then(cards=>cards.length),2);
    for(const viewport of [{width:1440,height:1000},{width:768,height:1000},{width:390,height:844}]){
      await h.page.setViewport(viewport);
      assert.ok(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await h.page.select("select","chargeback");assert.equal(await h.page.$$(".case-card").then(cards=>cards.length),1);
    await h.page.click("#case-example-chargeback");await h.page.waitForSelector("dialog[open] .detail-checklist");
    assert.equal(await h.page.$$("dialog .detail-checklist li").then(items=>items.length),5);
    assert.equal(await h.page.$$("dialog .record-link").then(items=>items.length),0);
    await h.page.keyboard.press("Escape");assert.equal(await h.page.$("dialog[open]"),null);
    assert.equal(await h.page.evaluate(()=>document.activeElement?.id),"case-example-chargeback");
    assert.ok(h.calls.every(c=>c.method==="GET"&&c.path.startsWith("/api/workspace/transactions")));assert.deepEqual(h.external,[]);assert.deepEqual(h.errors,[]);
  }finally{await h.context.close();}
});
test("new case opens existing light workspace; deep links, reload, Back and aliases retain the case",async()=>{
  const h=await fixture();try{
    await click(h.page,"+ New transaction");await h.page.type("#case-title","Quarterly review");
    await click(h.page,"Create & open workspace");await h.page.waitForSelector(".workspace");
    assert.equal(new URL(h.page.url()).pathname,"/workspace");assert.equal(new URL(h.page.url()).searchParams.get("case"),caseId);
    await h.page.waitForSelector("#task");assert.equal(await h.page.$eval("#task",el=>(el as HTMLTextAreaElement).value),"");
    await h.page.reload({waitUntil:"networkidle0"});assert.ok(await h.page.$(".workspace"));
    await h.page.click('a[href="/#transactions"]');await h.page.waitForSelector(".home");assert.equal(await h.page.$$(".case-card").then(items=>items.length),3);
    await h.page.evaluate(()=>history.back());await h.page.waitForFunction(()=>location.pathname==="/workspace");await h.page.waitForSelector(".workspace");
    await h.page.evaluate(()=>history.forward());await h.page.waitForFunction(()=>location.pathname==="/");await h.page.waitForSelector(".home");
    await h.page.goto(new URL("/?preflight=1",base).href,{waitUntil:"networkidle0"});assert.ok(await h.page.$(".workspace"));
    assert.ok(h.calls.every(c=>!c.path.match(/sign|run|reconcile|health|selftest/)));assert.deepEqual(h.errors,[]);
  }finally{await h.context.close();}
});
test("focus and cross-tab invalidation refresh board metadata without provider operations",async()=>{
  const h=await fixture();try{
    const changed={...h.board.cases[0],id:caseId,title:"Saved in another tab",provenance:"workspace" as const,status:"open" as const};h.board.cases.push(changed);
    const other=await h.context.newPage();await other.goto(new URL("/envoi-logo.png",base).href,{waitUntil:"domcontentloaded"});
    // This second page is for a real same-origin storage event; abort any API/provider work.
    await other.evaluate(()=>localStorage.setItem("envoi-board-change",crypto.randomUUID()));
    await h.page.waitForSelector(`#case-${caseId}`);
    changed.status="done";await h.page.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await h.page.waitForFunction(id=>!!document.querySelector(`.stage-done #case-${id}`),{},caseId);
    assert.ok(h.calls.every(c=>c.method==="GET"&&c.path.startsWith("/api/workspace/transactions")));assert.deepEqual(h.errors,[]);
  }finally{await h.context.close();}
});
test("fresh and restored Atlas replies render safely and wide content stays inside the mobile panel",async()=>{
  const h=await fixture("/workspace");try{
    const id="saved-answer",text="## Saved findings\n\n**Readable bold**\n\n- First point\n- Second point\n\n| A | B |\n| --- | --- |\n| "+"wide-data-".repeat(50)+" | Result |\n\n```\n"+"long-code-".repeat(70)+"\n```\n\n![pixel](https://tracker.invalid/pixel)\n\n<script>window.__unsafe=true</script>\n\n[unsafe](javascript:alert%281%29) [web](https://example.com/report)";
    h.state.conversations.push({id,task:"**User text stays plain**",report:{fileName:"plain.txt",text:"**Report stays plain**"},permissionId:"",createdAt:new Date().toISOString(),transcript:text,receiptIds:[],status:"complete"});
    h.state.currentTransaction={id:caseId,title:"Saved review",scenario:"consulting",provenance:"workspace",status:"in_progress",revision:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),conversationIds:[id],permissionIds:[],operationIds:[],receiptIds:[]};
    await h.page.goto(new URL(`/workspace?case=${caseId}`,base).href,{waitUntil:"networkidle0"});await h.page.waitForSelector(".atlas-reply strong");
    assert.equal(await h.page.$eval(".atlas-reply strong",el=>el.textContent),"Readable bold");
    assert.equal(await h.page.$$(".atlas-reply img,.atlas-reply script,.atlas-reply a[href^=javascript]").then(items=>items.length),0);
    assert.equal(await h.page.$eval(".bubble:not(.atlas) pre",el=>el.textContent),"**User text stays plain**");
    const safe=await h.page.$('.atlas-reply a[href="https://example.com/report"]');assert.equal(await safe?.evaluate(el=>el.getAttribute("target")),"_blank");
    await h.page.setViewport({width:390,height:844});assert.ok(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await h.page.type("#task","A new question");await h.page.click('input[value=document]');await click(h.page,"Send message");await h.page.waitForFunction(()=>[...document.querySelectorAll(".atlas-reply strong")].some(el=>el.textContent==="Fresh answer"));
    const sent=h.calls.find(c=>c.path.endsWith("/submit"));assert.equal(sent?.body.transactionId,caseId);assert.equal(h.state.conversations[0].transcript,text);
    await h.page.reload({waitUntil:"networkidle0"});assert.ok(await h.page.$$(".atlas-reply strong").then(items=>items.length>=2));
    assert.deepEqual(h.external,[]);assert.deepEqual(h.errors,[]);
  }finally{await h.context.close();}
});
test("storage failure leaves the landing readable and does not fabricate a populated board",async()=>{
  const h=await fixture();try{
    h.settings.unavailable=true;await click(h.page,"Refresh board ↻");
    assert.ok(await h.page.$("#hero-title"));assert.match(await h.page.$eval('[role="alert"]',el=>el.textContent??""),/unavailable/);
    // Previously loaded cards remain visible as stale data, accompanied by the error.
    assert.ok(h.calls.every(c=>c.method==="GET"));assert.deepEqual(h.errors,[]);
  }finally{await h.context.close();}
});
