// Read-only local setup report. Never prints secrets, signs, calls a model or reads RPC.
import { serviceDiagnostics } from "../server/workspace-diagnostics.ts";
import { pool } from "../server/storage/repository.ts";
try {
  const status=await serviceDiagnostics(false);
  console.log(JSON.stringify(status,null,2));
  if(!status.aiConfigured)console.log("Set ANTHROPIC_API_KEY in your ignored .env to enable AI. Restart after changes.");
  console.log("Keep MONAD_MAX_TRANSACTIONS=0 until a separate bounded live allowance is approved.");
}catch{console.error("Local storage is unavailable. Start your dedicated PostgreSQL database, verify DATABASE_URL, and run npm run db:push for development setup.");process.exitCode=1;}
finally{await pool.end();}
