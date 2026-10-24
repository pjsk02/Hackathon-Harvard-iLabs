# Backend compatibility after main integration

Main's P2 modules retain their original public factories and tests under
`server/agent/agent.ts`, `server/gateway/gateway.ts`, `server/gateway/checks.ts`
and the older route modules. These preserve the older two-tool, time-based
compatibility interfaces; they are not mounted as public application routes.

The persistent product uses the `workspace-agent`, `workspace-gateway` and
`workspace-checks` modules through `server/routes/workspace.ts`. Those enforce
six signed permissions and persist original request evidence. Protected data
still enters through `server/gateway/gateway.ts` only. The workspace gateway
calls its fixed action resolver after authorization.

This split preserves incoming P2 functionality without allowing old demo
routes, public evaluation tests or retry caches to bypass durable workspaces.
`npm run test:p2` runs the older offline compatibility tests; `npm test` and
`npm run test:storage` cover the persistent integration. No live calls are made.
The isolated compatibility self-test resets only its child-process fixture,
not a production HTTP generation context.
