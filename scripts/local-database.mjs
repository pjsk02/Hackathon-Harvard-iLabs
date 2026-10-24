// Resume only the already-initialized, loopback-only local test database.
// No download, account, OS service, schema change or allowance change is performed.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const run=promisify(execFile);
const root=new URL("../",import.meta.url);
const binary=fileURLToPath(new URL("generated-artifacts/postgres-runtime/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe",root));
const data=fileURLToPath(new URL("generated-artifacts/postgres-data",root));
const log=fileURLToPath(new URL("generated-artifacts/postgres.log",root));
try{
 const url=new URL(process.env.DATABASE_URL ?? "");
 if(process.platform!=="win32" || url.hostname!=="127.0.0.1" || url.port!=="55439" || url.pathname!=="/envoi_integration" || !existsSync(binary) || !existsSync(data+"/PG_VERSION"))throw new Error("Use your configured development PostgreSQL service. This helper only resumes the existing portable Windows cluster at 127.0.0.1:55439/envoi_integration.");
 let started=false;try{await run(binary,["status","-D",data],{windowsHide:true});}catch{await run(binary,["start","-D",data,"-l",log,"-o","-h 127.0.0.1 -p 55439","-w"],{windowsHide:true,timeout:15000});started=true;}
 console.log(started?"Local PostgreSQL resumed on 127.0.0.1:55439.":"The local PostgreSQL cluster is already running.");
}catch(error){console.error(error.message);process.exitCode=1;}
