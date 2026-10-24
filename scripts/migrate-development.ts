import { readFile } from "node:fs/promises";
import { pool } from "../server/storage/repository";
if (process.env.NODE_ENV === "production") throw new Error("Use Replit's production schema workflow; this script is development-only.");
try { await pool.query(await readFile(new URL("../server/storage/schema.sql", import.meta.url), "utf8")); }
finally { await pool.end(); }
