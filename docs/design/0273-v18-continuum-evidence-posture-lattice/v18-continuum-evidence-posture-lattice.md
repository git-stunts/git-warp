---
title: "PROTO-0273 - Continuum Evidence Posture Lattice"
cycle: "0273"
task_id: "v18-continuum-evidence-posture-lattice"
legend: "PROTO"
release_home: "v18.0.0"
status: "proposed"
owners:
  - "@git-stunts"
sponsors:
  human: "James"
  agent: "Antigravity"
blocking_issues: []
supersedes:
  - "0154-v18-evidence-posture"
superseded_by: null
created: "2026-06-15"
updated: "2026-06-15"
---

# PROTO-0273 - Continuum Evidence Posture Lattice

## Linked Issue

- https://github.com/git-stunts/git-warp/issues/701

## Design Type

This design is primarily:

- [x] Runtime/API
- [ ] Storage/substrate
- [ ] Sync/protocol
- [ ] Migration/release
- [ ] CLI/operator
- [x] Docs/public guidance
- [ ] TUI/visual surface
- [x] Test/tooling

## Decision Summary

git-warp will replace the flat `ContinuumEvidencePosture` string enum with a multi-dimensional lattice struct containing four distinct dimensions: Origin, Proof Strength, Access, and Completeness. This ensures that the runtime can distinguish between native vs. translated history and redact or verify partial logs without collapsing them into a single unproven status.

This design aligns with AION Foundations Paper VIII: evidence posture is a structured property of causal claims crossing participant boundaries, enabling fine-grained capability checks and privacy-preserving audits.

## Sponsored Human

An operator or developer wants to audit incoming causal history from remote runtimes (such as Echo) and verify whether the claims carry native zero-knowledge proof witnesshood or translated Git objects, and whether any sections have been redacted under a sovereign privacy policy, without metadata loss.

## Sponsored Agent

An autonomous agent needs a structured lattice interface to programmatically determine what capability chains are presented, what history segments are complete, and what missing evidence is blocked by policy, so it can formulate valid intents or request credentials without parsing unstructured error text.

## Hill

By the end of this design cycle, the `ContinuumEvidencePosture` class will be refactored into a four-dimensional lattice type. The change will be verified by a suite of unit tests checking boundary-posture validations, and the codebase will compile with no type errors.

## Current Truth

Currently, `ContinuumEvidencePosture.ts` defines the posture as a flat string enum:
[src/domain/continuum/ContinuumEvidencePosture.ts#8](file:///Users/james/git/git-stunts/git-warp/src/domain/continuum/ContinuumEvidencePosture.ts#L8).
This collapses the dimensions, meaning we cannot distinguish between "translated but witnessed" and "native but redacted" history.
This flat posture is used inside `ContinuumEvidenceClaim` to validate UCAN-style proof presence:
[src/domain/continuum/ContinuumEvidenceClaim.ts#50](file:///Users/james/git/git-stunts/git-warp/src/domain/continuum/ContinuumEvidenceClaim.ts#L50).

## Playback Questions

- Can the lattice represent all twenty permutations of causal trust specified in Paper VIII?
- Does the Access dimension prevent key correlation across braids?
- Can the compiler statically type-check lattice-admissibility constraints?

## Design

### 1. Lattice Dimensions

We define four dimensions:
1.  **Origin:** `native` | `translated` | `fixture` | `synthetic` | `descriptor`
2.  **Proof Strength:** `witnessed` | `digest-only` | `claimed` | `none`
3.  **Access:** `available` | `redacted` | `credential-required` | `denied`
4.  **Completeness:** `complete` | `partial` | `residual` | `obstructed` | `unsupported`

### 2. Typings & Class Struct

```typescript
export type CausalOrigin = 'native' | 'translated' | 'fixture' | 'synthetic' | 'descriptor';
export type CausalProofStrength = 'witnessed' | 'digest-only' | 'claimed' | 'none';
export type CausalAccess = 'available' | 'redacted' | 'credential-required' | 'denied';
export type CausalCompleteness = 'complete' | 'partial' | 'residual' | 'obstructed' | 'unsupported';

export interface ContinuumEvidencePostureFields {
  readonly origin: CausalOrigin;
  readonly proofStrength: CausalProofStrength;
  readonly access: CausalAccess;
  readonly completeness: CausalCompleteness;
}

export default class ContinuumEvidencePosture {
  readonly origin: CausalOrigin;
  readonly proofStrength: CausalProofStrength;
  readonly access: CausalAccess;
  readonly completeness: CausalCompleteness;

  constructor(fields: ContinuumEvidencePostureFields) {
    this.origin = requireOrigin(fields.origin);
    this.proofStrength = requireProofStrength(fields.proofStrength);
    this.access = requireAccess(fields.access);
    this.completeness = requireCompleteness(fields.completeness);
    Object.freeze(this);
  }

  isShareable(): boolean {
    return (
      this.origin === 'native' &&
      this.proofStrength === 'witnessed' &&
      this.access === 'available' &&
      this.completeness === 'complete'
    );
  }
}
```

## Implementation

1.  Create the new lattice dimensions and helper validation functions in `src/domain/continuum/ContinuumEvidencePosture.ts`.
2.  Refactor `ContinuumEvidenceClaim.ts` to accept the new `ContinuumEvidencePosture` structure in its constructor.
3.  Update the conversion fixtures in `GitWarpWitnessedSuffixSourceFacts.ts` and `GitWarpReadingEnvelopeSourceFacts.ts` to construct the lattice fields.

## Non-Goals

- Do not implement zero-knowledge verifiers in this cycle.
- Do not modify the Git Object DB persistence layers.

## RED

- Attempting to construct a posture with invalid lattice coordinates (e.g. `origin: 'invalid'`) must throw a validation error.
- Building a `native` witness claim without providing `nativeWitnessProof` must be rejected.

## Verification

```bash
npx vitest run test/unit/domain/continuum/ContinuumEvidencePosture.test.ts
npm run typecheck
npm run lint
```

## SSJS Scorecard

- **Runtime-backed forms:** Yes; coordinates are encapsulated in frozen class structures.
- **Boundary validation:** Yes; constructor validation rejects invalid coordinates at ingestion gates.
