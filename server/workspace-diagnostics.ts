import { checkReadiness } from "./readiness";
import { budget } from "./storage/repository";
import { llmConfigured } from "./agent/llm";
import { issuerAddressOrNull, isMockChain } from "./chain";
import type { HealthResponse } from "../shared/contract";

export type ServiceDiagnostics={checkedAt:string;storage:"connected";aiConfigured:boolean;signingConfigured:boolean;practiceMode:boolean;transactionLimit:number;chainRemaining:number;modelRemaining:number;recordingPaused:boolean;network?:HealthResponse};
export function transactionLimit(value=process.env.MONAD_MAX_TRANSACTIONS):number {
  return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
}
/** Configuration-only checks have no provider/RPC side effects. Network is opt-in. */
export async function serviceDiagnostics(network=false,readiness=checkReadiness):Promise<ServiceDiagnostics>{
  const [chain,model]=await Promise.all([budget("chain"),budget("model")]);
  const limit=transactionLimit();
  const result:ServiceDiagnostics={checkedAt:new Date().toISOString(),storage:"connected",aiConfigured:llmConfigured(),signingConfigured:!!issuerAddressOrNull(),practiceMode:isMockChain(),transactionLimit:limit,chainRemaining:Math.max(0,(chain?.approved??0)-(chain?.spent??0)),modelRemaining:Math.max(0,(model?.approved??0)-(model?.spent??0)),recordingPaused:limit===0 || !chain || chain.spent>=chain.approved};
  if(network){
    result.network=await readiness();
    if(result.network.readiness){
      result.network.readiness.recording.remaining=Math.min(result.network.readiness.recording.remaining,result.chainRemaining);
      result.network.readiness.recording.paused=result.recordingPaused;
      result.network.readiness.recording.detail=result.recordingPaused?"Live recording is paused or its durable allowance is exhausted.":"Recording uses the remaining shared, durable allowance.";
    }
  }
  return result;
}
