---
id: SPEC_coverage-ratchet-baseline-drop
blocked_by: []
blocks: []
feature: tooling-release
release_home: v19.0.0
---

# Coverage ratchet baseline dropped during v17 release preflight

**Effort:** L

## What's Wrong

Cycle `0144-release-preflight-and-rc` had to reset the global line coverage
ratchet to the current v17 full-suite baseline of `91.74%` so release
preflight could honestly pass from the current branch. The previous threshold
was `95.43%`, and the drop is concentrated in newer or under-exercised
surfaces such as optics, trust-chain storage, snapshot helpers, and several
type-heavy capability modules.

This is not a unit-test failure; `npm run test:coverage` still executes the
full unit suite successfully. The bad code is the amount of production code now
below the old coverage bar.

## Suggested Fix

Run a post-v17 coverage paydown cycle that starts from
`coverage/coverage-final.json`, ranks low-coverage executable files by
statement count and release risk, and adds behavioral tests for the highest
value gaps first. Avoid ratcheting by vanity percentage alone; prioritize
optic/read-basis behavior, trust-chain adapter failure paths, snapshot
immutability, and current public API compatibility.
