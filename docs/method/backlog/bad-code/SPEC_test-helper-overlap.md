---
blocked_by: []
blocks: []
id: DX_test-helper-overlap
---

# Test helper overlap — consolidate fixture DSLs

`fixtureDsl.js`, `stateBuilder.js`, `warpGraphTestUtils.js`, and
`topologyHelpers.js` all build test graph state with overlapping APIs.
Now that `mockPorts.ts`, `mockHost.ts`, and `patchFactories.ts` exist
as the canonical shared fixtures, the older helpers should be audited:

- What do they provide that the new fixtures don't?
- Can fixtureDsl + topologyHelpers merge into one module?
- Can stateBuilder delegate to patchFactories?
- warpGraphTestUtils has OID generators and real-Git repo helpers —
  those are orthogonal and should stay, but the state-building parts
  may now be redundant.
