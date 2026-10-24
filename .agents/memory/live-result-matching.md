---
name: Persisted document matching
description: PostgreSQL JSON object key order must not affect matching live enforcement results.
---
Compare document fields or durable request IDs, never serialized object strings, when associating live results with a submitted document.

**Why:** A real paid/Monad browser run completed and saved its receipts, but JSONB reordered the document keys. The UI incorrectly showed no result even though the chain evidence was finalized. In-memory response fixtures had hidden this.

**How to apply:** Make browser response fixtures reorder object keys like database JSONB, and include read-only history restoration tests so viewing evidence never requires repeating paid work.
