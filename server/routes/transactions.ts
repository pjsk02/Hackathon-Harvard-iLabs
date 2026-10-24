import { Router } from "express";
import { workspace } from "../storage/repository";
import { boardWorkspace,caseDetail,listCases,mutateCase } from "../storage/transactions";
import { UUID_PATTERN } from "../../shared/attempt-record";
import { httpError } from "../http";

export const transactionsRouter=Router(); // Mounted behind the existing workspace session/CSRF checks.
transactionsRouter.get("/api/workspace/transactions",async (_req,res)=>res.json(await listCases(await boardWorkspace(workspace().id))));
transactionsRouter.get("/api/workspace/transactions/:id",async (req,res)=>res.json(await caseDetail(await boardWorkspace(workspace().id),String(req.params.id))));
transactionsRouter.post("/api/workspace/transactions",async (req,res)=>{
  const id=req.get("Idempotency-Key"), title=req.body?.title;
  if (!id || !UUID_PATTERN.test(id) || typeof title!=="string" || !title.trim() || title.trim().length>100 || /[\x00-\x1f]/.test(title)) throw httpError(400,"Use a request identifier and a transaction title of 1–100 characters.");
  const w=await mutateCase(workspace().id,id.toLowerCase(),{action:"create",title:title.trim()});
  res.json({...await listCases(w),createdId:id.toLowerCase()});
});
transactionsRouter.post("/api/workspace/transactions/:id/status",async (req,res)=>{
  if (!UUID_PATTERN.test(req.get("Idempotency-Key") ?? "") || !["done","in_progress"].includes(req.body?.status) || !Number.isSafeInteger(req.body?.revision)) throw httpError(400,"Choose Done or Reopen with the current transaction revision.");
  const w=await mutateCase(workspace().id,String(req.params.id),{action:"status",status:req.body.status,revision:req.body.revision});
  res.json(await caseDetail(w,String(req.params.id)));
});
