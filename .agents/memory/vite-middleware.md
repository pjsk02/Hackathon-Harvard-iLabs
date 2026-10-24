---
name: Vite middleware mode quirks (Vite 8)
description: Gotchas when embedding Vite in the Express server.
---
Inline `root` in createServer overrides vite.config.ts root and the SPA 404s; let the config file own root. `server.hmr.server` is deprecated in Vite 8; use `server.ws.server` with the shared http server so HMR works through the single proxied port.
**Why:** both cost a debugging round during scaffolding.
**How to apply:** any edit to server/index.ts dev setup.
