---
title: "PROTO-0274 - ZK-Verkle Wormhole Compression"
cycle: "0274"
task_id: "v18-zk-verkle-wormholes"
legend: "PROTO"
release_home: "v18.0.0"
status: "proposed"
owners:
  - "@git-stunts"
sponsors:
  human: "James"
  agent: "Antigravity"
blocking_issues: []
supersedes: []
superseded_by: null
created: "2026-06-15"
updated: "2026-06-15"
---

# PROTO-0274 - ZK-Verkle Wormhole Compression

## Linked Issue

- https://github.com/git-stunts/git-warp/issues/702

## Design Type

This design is primarily:

- [ ] Runtime/API
- [x] Storage/substrate
- [ ] Sync/protocol
- [ ] Migration/release
- [ ] CLI/operator
- [ ] Docs/public guidance
- [ ] TUI/visual surface
- [x] Test/tooling

## Decision Summary

git-warp will upgrade its sequential-replay `WormholeEdge` to support Paper VIII hologram replay semantics and ZK-Verkle wormhole compression. A tick hologram replays one admitted transition; a braid hologram replays or materializes a settled weave; and a suffix-transform hologram replays or materializes the lawful transport of a remote suffix onto a local basis. Wormhole compression then compacts those replay-bearing holograms through hot, warm, and cold tiers.

The cold tier replaces a replay payload with a space-time polynomial commitment root $\mathcal{R}_{ST}$ and a zk-SNARK transition proof $\pi_{ZK}$. Verifying a compressed execution segment becomes a $O(1)$ pairings check, and intermediate tick queries are resolved via $O(1)$ multi-point opening proofs without deferred payload expansion.

## Sponsored Human

An operator running a deep historical sync wants to verify the correctness of a thousand-tick range or multi-strand settlement without pulling and replaying every patch CBOR blob, optimizing bandwidth and execution cycles.

## Sponsored Agent

An autonomous agent needs to inspect a target state value at tick $t_C$ inside a compressed segment, braid, or suffix transform to check if it has write authorization, without materializing a full node graph in RAM.

## Hill

By the end of this design cycle, the domain will define replay-bearing hologram classes for tick, braid, and suffix-transform outputs, plus cold ZK-Verkle wormhole classes for space-time commitments and opening proofs. A mock prover backend will verify the structures in unit tests, ensuring the API is ready for cryptographic integration.

## Current Truth

Currently, `WormholeService.ts` only supports sequential replay of `ProvenancePayload`:
[src/domain/services/WormholeService.ts#48](file:///Users/james/git/git-stunts/git-warp/src/domain/services/WormholeService.ts#L48).
There is no representation of Verkle roots, space-time bivariate polynomials, or SNARK proofs in the codebase.

The current Continuum witness ladder already separates replay core, witness core, and receipt shell for tick receipts. It does not yet generalize that replay/materialization contract to braid holograms or suffix-transform holograms.

## Playback Questions

- What is the performance overhead of generating Verkle commitments over small tick ranges?
- Does DPOI confluence check cleanly under polynomial evaluation constraints?
- Can braid holograms deterministically materialize a settled weave the same way tick holograms replay a single tick?
- Can suffix-transform holograms deterministically materialize the lawful result of remote suffix transport onto a local basis?

## Design

### 1. Hologram Replay Semantics

Paper VIII defines three replay-bearing hologram classes:

1. **Tick Hologram:** witnesses a local state transition and replays `U_k -> U_{k+1}`.
2. **Braid Hologram:** witnesses merge alignment of parallel or private strands and materializes a settled shared projection without exposing unblinded private strand contents.
3. **Suffix Transform Hologram:** witnesses distributed synchronization transport and materializes the merged confluent history by verifying the remote suffix was safely slid across the local suffix without conflict.

These are boundary shells, not transport DTOs. In TypeScript they must be runtime-backed classes with constructors that validate basis, aperture, proof, and replay/materialization inputs.

### 2. Bivariate Space-Time Commitment

The execution segment is represented as a polynomial $f(X, Y) \in \mathbb{F}_p[X, Y]$, where:
*   $X$ is the logical tick coordinate.
*   $Y$ is the node structural index.
*   $f(t, x)$ evaluates to the payload hash of node $x$ at tick $t$.

### 3. Runtime-Backed Domain Objects

```typescript
export default class ZKWormholeEdge {
  readonly fromSha: string;
  readonly toSha: string;
  readonly writerId: string;
  readonly startStateRoot: string;
  readonly endStateRoot: string;
  readonly spaceTimeCommitment: string; // R_ST (Bivariate Verkle Root)
  readonly transitionProof: Uint8Array;  // zk-SNARK verifying DPOI laws
  readonly patchCount: number;
}

export default class ApertureOpeningProof {
  readonly evaluatedTick: number;
  readonly evaluatedNodeId: string;
  readonly evaluatedValue: Uint8Array;
  readonly verkleProof: Uint8Array; // Inner Product Argument (IPA) bytes
}
```

## Implementation

1.  Introduce `TickHologram`, `BraidHologram`, and `SuffixTransformHologram` as replay/materialization-capable domain classes.
2.  Introduce `ZKWormholeEdge` and `ApertureOpeningProof` as runtime-backed domain classes, not interfaces.
3.  Add a verifier port for transition proofs and opening proofs.
4.  Add `verifyZKWormhole` to coordinate ZK proof validation.
5.  Add `openAperture` to extract and verify specific node values.
6.  Keep existing sequential `WormholeEdge` replay intact as the warm tier until cold proof backends exist.

## Non-Goals

- Do not implement Rust-based halo2 bindings in this cycle.
- Do not modify the local Git checkpoint tree materialization.

## RED

- Verifying a ZK-Wormhole with mismatched start/end state roots must fail verification.
- Querying a tick coordinate outside the wormhole's range must throw a bounds error.

## Verification

```bash
npx vitest run test/unit/domain/services/WormholeService.test.ts
```
