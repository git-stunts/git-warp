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

git-warp will upgrade its sequential-replay `WormholeEdge` to support ZK-Verkle Wormhole compression. This replaces the basic `ProvenancePayload` checkpoint with a space-time polynomial commitment root $\mathcal{R}_{ST}$ and a zk-SNARK transition proof $\pi_{ZK}$. Verifying a compressed execution segment becomes a $O(1)$ pairings check, and intermediate tick queries are resolved via $O(1)$ multi-point opening proofs without deferred payload expansion.

## Sponsored Human

An operator running a deep historical sync wants to verify the correctness of a thousand-tick range without pulling and replaying the actual transaction patch CBOR blobs, optimizing bandwidth and execution cycles.

## Sponsored Agent

An autonomous agent needs to inspect a target state value at tick $t_C$ inside a compressed segment to check if it has write authorization, without materializing a full node graph in RAM.

## Hill

By the end of this design cycle, `WormholeService` will define schemas for space-time commitments and opening proofs. A mock prover backend will verify the structures in unit tests, ensuring the API is ready for cryptographic integration.

## Current Truth

Currently, `WormholeService.ts` only supports sequential replay of `ProvenancePayload`:
[src/domain/services/WormholeService.ts#48](file:///Users/james/git/git-stunts/git-warp/src/domain/services/WormholeService.ts#L48).
There is no representation of Verkle roots, space-time bivariate polynomials, or SNARK proofs in the codebase.

## Playback Questions

- What is the performance overhead of generating Verkle commitments over small tick ranges?
- Does DPOI confluence check cleanly under polynomial evaluation constraints?

## Design

### 1. Bivariate Space-Time Commitment

The execution segment is represented as a polynomial $f(X, Y) \in \mathbb{F}_p[X, Y]$, where:
*   $X$ is the logical tick coordinate.
*   $Y$ is the node structural index.
*   $f(t, x)$ evaluates to the payload hash of node $x$ at tick $t$.

### 2. Upgraded Schemas

```typescript
export interface ZKWormholeEdge {
  readonly fromSha: string;
  readonly toSha: string;
  readonly writerId: string;
  readonly startStateRoot: string;
  readonly endStateRoot: string;
  readonly spaceTimeCommitment: string; // R_ST (Bivariate Verkle Root)
  readonly transitionProof: Uint8Array;  // zk-SNARK verifying DPOI laws
  readonly patchCount: number;
}

export interface ApertureOpeningProof {
  readonly evaluatedTick: number;
  readonly evaluatedNodeId: string;
  readonly evaluatedValue: Uint8Array;
  readonly verkleProof: Uint8Array; // Inner Product Argument (IPA) bytes
}
```

## Implementation

1.  Introduce the upgraded `ZKWormholeEdge` and `ApertureOpeningProof` interfaces in `src/domain/services/WormholeService.ts`.
2.  Add a `verifyZKWormhole` method in `WormholeService` to coordinate ZK proof validation.
3.  Add an `openAperture` method to extract and verify specific node values.

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
