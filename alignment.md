Before anyone writes more against the current interface, hold a short three-person alignment and agree these five points:

Policy: recorded before the request—not “proven created before the request.”
Ordering: finalized block references—not timestamps alone.
Verification: actual request context, trusted issuer, recomputed digest.
Failure behavior: no chain verification means no data; no server-clock fallback.
Evidence scope: approve receipt commitments, or explicitly narrow the public-record claim.
Then split the handoff:

You / P1: signing, chain evidence, reliable anchoring, dispute construction.
Jay / P2: context capture, deterministic verification, neutral prompt, live-model test.
Rachel / P3: agreed shared types, state/evidence handling, accurate labels, early deployment.
The two highest-value regression tests are:

