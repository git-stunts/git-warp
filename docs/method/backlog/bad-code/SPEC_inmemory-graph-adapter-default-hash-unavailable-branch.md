---
id: SPEC_inmemory-graph-adapter-default-hash-unavailable-branch
blocked_by: []
blocks: []
feature: api-capabilities
---

# PROTO_inmemory-graph-adapter-default-hash-unavailable-branch

## What stinks

`src/infrastructure/adapters/InMemoryGraphAdapter.js` still has the `defaultHash()` fallback throw at line 116:

- `"No hash function available. Pass { hash } to InMemoryGraphAdapter constructor."`

In normal Node test/runtime truth, the constructor eagerly kicks off the `node:crypto` probe and public methods await `_cryptoReady` before hashing. That leaves the `defaultHash()` no-crypto throw effectively unreachable in the supported environment.

## Why it matters

- Coverage work turns into trying to sabotage module-scoped runtime initialization instead of testing adapter behavior.
- The remaining line does not represent a realistic failure mode in the Node path that the adapter is designed to serve.

## Suggested direction

- Move the capability check to an explicit injectable boundary that can be tested directly, or
- replace the branch with an assertion documenting that the public API should never reach it after `_cryptoReady`.

## Evidence

- After the cycle 0010 adapter tranche, `InMemoryGraphAdapter.js` was reduced to this single environment-coupled branch while missing-commit, SHA-ref resolution, log formatting, duplicate-parent traversal, and input validation behavior were covered.
