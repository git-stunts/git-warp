---
title: "API-0275 - Reified Optics"
cycle: "0275"
task_id: "v18-reified-optics"
legend: "API"
release_home: "v18.1.0"
issue: "https://github.com/git-stunts/git-warp/issues/665"
status: "draft"
base_commit: "33ed62aaef7f323b60b17398cc87eab8d4a2ed79"
owners:
  - "@git-stunts"
sponsors:
  human: "James"
  agent: "Codex"
blocking_issues: []
supersedes: []
superseded_by: null
created: "2026-06-23"
updated: "2026-06-23"
---

# API-0275 - Reified Optics

## Linked Issue

- https://github.com/git-stunts/git-warp/issues/665

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

`Optic` becomes a first-class runtime noun before `v18.1.0` ships. The current
fluent read path stays usable, but it must lower through a frozen, validated
`Optic` domain object that names the read question, its coordinate posture, its
aperture relationship, and the bounded support rule needed to answer it. The
new noun ties git-warp's callable optic path back to the Paper VII admission
kernel and to Continuum's boundary vocabulary without claiming native Continuum
witnesshood.

## Sponsored Human

A library user wants the docs, API surface, and runtime model to agree on what
an optic is so they can build coherent bounded reads without treating a method
chain as a hidden execution plan.

## Sponsored Agent

An agent needs an inspectable `Optic` value so it can classify read intent,
support, basis evidence, and failure posture without parsing README prose,
method names, or private fluent-builder internals.

## Hill

By the end of this cycle, callers and tests can construct or observe a
runtime-backed `Optic` for node, node-property, neighborhood, and traversal
reads. `coordinate().optic().node(...).prop(...).read()` still works, but the
runtime proves that the chain lowers into a validated `Optic` value before the
checkpoint-tail locator answers. Public docs can then move `Optic` from
`target` to `shipped` or a deliberately narrower `transition` status with
evidence.

## Current Truth

The README and topic guide now teach optics as the bounded question asked of
causal history, while explicitly warning that no first-class optic noun exists
in runtime yet.

Evidence:

- [README.md#L73:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/README.md#L73)
- [README.md#L189:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/README.md#L189)
- [docs/topics/optics.md#L49:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/docs/topics/optics.md#L49)

`docs/GLOSSARY.md` is the canonical noun source and currently marks `Optic` as
`target` because the runtime has no first-class optic noun.

Evidence:

- [docs/GLOSSARY.md#L40:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/docs/GLOSSARY.md#L40)

The implementation has frozen fluent read-path objects (`WorldlineOptic`,
`NodeOptic`, `NodePropertyOptic`, `NeighborhoodOptic`, and `TraversalOptic`),
but those are path/building surfaces. They do not expose a single domain object
that represents the semantic read question or can cross an agent or Continuum
boundary.

Evidence:

- [src/domain/services/optic/WorldlineOptic.ts#L5:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/src/domain/services/optic/WorldlineOptic.ts#L5)
- [src/domain/services/optic/OpticReadTarget.ts#L16:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/src/domain/services/optic/OpticReadTarget.ts#L16)

Continuum-family evidence already has runtime-backed posture coordinates.
Reified git-warp optics must coordinate with that vocabulary, especially
translated versus native evidence posture, without making git-warp the owner of
Continuum family semantics.

Evidence:

- [src/domain/continuum/ContinuumEvidencePosture.ts#L16:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/src/domain/continuum/ContinuumEvidencePosture.ts#L16)
- [docs/BEARING.md#L21:33ed62aaef7f323b60b17398cc87eab8d4a2ed79](https://github.com/git-stunts/git-warp/blob/33ed62aaef7f323b60b17398cc87eab8d4a2ed79/docs/BEARING.md#L21)

## Problem

The public documentation now depends on `Optic` as an architectural noun, but
runtime truth still represents optics as fluent helper objects plus local target
records. That gap leaves three release risks:

- The docs can overstate runtime truth by treating `Optic` as shipped.
- Agents cannot inspect or serialize the read question as a stable value.
- Paper VII admission vocabulary cannot attach to a read intent before
  execution because there is no admitted optic object to classify.

## Scope

This cycle includes:

- a frozen `Optic` class or family under `src/domain/services/optic/`;
- runtime-backed target, coordinate, aperture, basis, support, and Continuum
  posture fields sufficient for the public v18 read path;
- lowering from existing fluent path calls into reified optics;
- read execution that consumes reified optics before invoking checkpoint-tail
  witness location;
- public exports and consumer typecheck evidence if the noun is public;
- docs and glossary updates that change `Optic` status only after tests prove
  runtime truth.

## Non-Goals

This cycle does not include:

- native Continuum witnesshood;
- a new sync protocol or remote optic transport;
- full materialization-plan implementation for every query shape;
- cryptographic proof generation;
- storage format changes;
- removal of the existing fluent optic API.

## Runtime / API Contract

The runtime contract is:

- `Optic` is a domain object, not a transport DTO, interface, shape alias, or
  builder-only helper.
- `Optic` construction validates kind-specific target identity and rejects
  empty node ids, empty property keys, unsupported traversal strategies, and
  missing basis posture.
- `Optic` owns the semantic question: node, node property, neighborhood, or
  traversal.
- `Optic` records the coordinate posture needed for a coherent read without
  depending on live worldline mutation after capture.
- `Optic` records the bounded support rule or the reason no bounded support can
  be claimed.
- Fluent calls lower into an `Optic` before execution. The method chain remains
  a convenience surface, not the source of truth.
- Expected read absence remains data. Evidence failure remains typed failure.

The first public shape should be conservative. If the runtime cannot yet expose
the complete coordinate or aperture object safely, the `Optic` noun may expose a
smaller frozen public view while keeping the full domain object internal. That
public view must still be produced from the runtime-backed noun, not from a
parallel string formatter.

## Data / State Model

`Optic` represents an immutable read-intent value:

- kind: one of node, node-property, neighborhood, traversal;
- target: validated target identity;
- coordinate posture: live one-off or captured coordinate;
- aperture posture: default full read aperture or observer-owned aperture;
- basis posture: checkpoint-tail basis verified, absent, unsupported, or
  residual;
- support posture: exact entity, neighborhood, traversal window, or
  global-discovery refusal;
- evidence posture: translated git-warp evidence versus native Continuum
  evidence, using existing Continuum posture vocabulary where applicable.

The model must not introduce `OpticLike`, `Record<string, unknown>`, erased
interfaces, or cast-based trust. Runtime constructors establish validity, and
downstream code dispatches on instances or validated coordinate classes.

## Architecture / Anti-SLUDGE Posture

The implementation must obey the Anti-SLUDGE policy:

- no `any`;
- no `unknown` outside adapter-owned parsers;
- no `as` assertions;
- no `OpticLike` or placeholder shape names;
- interfaces only for ports;
- no host APIs, ambient time, entropy, `JSON.parse`, or `JSON.stringify` in
  domain optic code.

The owning behavior belongs with the optic noun or with explicitly named
execution services. Boundary codecs, if any, stay in adapters.

## Cost / Residency Posture

Reified optics must preserve the v18 cost claim: first-use coordinate optics do
not silently materialize the full graph. If the runtime lacks a bounded basis,
the setup or read fails closed with the existing optic error posture rather
than using full-residency helpers.

Node and node-property optics are exact-support reads. Neighborhood and
traversal optics must name their support window and budget. Unsupported global
discovery must be represented as unsupported, not as a hidden fallback.

## Determinism / Replay / Causality

An optic read is deterministic only relative to a coordinate. The reified optic
therefore records whether it is live one-off work or coordinate-pinned work.
Coordinate-pinned optics must not observe writes admitted after coordinate
capture.

The Paper VII admission link is conceptual and contractual for this cycle:
`Optic` is the admitted read intent that can later receive witness/admission
outcome shells. This cycle does not implement distributed plural admission.

## Git Substrate Impact

No Git object layout or ref format changes are planned. The optic uses existing
checkpoint-tail evidence, shard facts, and patch streams. New tests may create
fixtures, but production storage remains compatible.

## Compatibility / Migration Posture

Existing public fluent calls must continue to work. If `Optic` is exported, it
must be added through the root barrel and consumer typecheck without removing
existing names.

Docs may move `Optic` from `target` only when the runtime noun lands. If the
landed noun is narrower than the canonical model, mark it `transition` and name
the missing pieces.

## Error Contract

Expected absence:

- missing node returns an absent node read result;
- missing property returns an absent property read result.

Evidence and contract failures:

- no bounded basis remains `E_OPTIC_NO_BOUNDED_BASIS`;
- tail budget overflow remains `E_OPTIC_TAIL_BUDGET_EXCEEDED`;
- malformed optic construction uses a typed optic schema or validation error;
- incompatible Continuum/native posture claims fail before execution.

## Accessibility Posture

No visual UI changes are included. Documentation changes must preserve a linear
reading model: first explain the shipped fluent path, then explain the runtime
noun status, then explain the categorical or Continuum connection.

## Agent Inspectability / Explainability Posture

Agents must be able to inspect:

- optic kind;
- target identity;
- coordinate or live posture;
- bounded support posture;
- evidence posture;
- failure posture when execution is refused.

This can be a frozen public context value or an existing reading-envelope field,
but it must be generated by the `Optic` noun and covered by tests.

## User-Facing Text / Directionality

The visible text changes are limited to README, topic docs, glossary status, and
release evidence. The text is English, left-to-right, and has no localization
catalog. Any machine-readable equivalent is the runtime optic context, not a
hidden prose parser.

## Linked Invariants

- Runtime truth wins: docs must not mark `Optic` shipped until runtime has a
  first-class noun.
- Coordinate coherence: coordinate-pinned optics read from the captured causal
  position.
- Boundedness: unsupported bounded support fails closed instead of falling back
  to full materialization.
- Continuum honesty: translated git-warp evidence is not native Continuum
  witnesshood.

## Design Alternatives Considered

1. Keep the fluent path only and update docs to avoid the noun.
   This avoids code churn but preserves the release blocker: the public model
   still lacks an inspectable runtime object for agents and admission posture.

2. Export `OpticReadTarget` as `Optic`.
   This is too small. A target names only the read's focus, not coordinate,
   basis, support, aperture, or evidence posture.

3. Create a transport DTO for Continuum first.
   This puts the boundary shape ahead of runtime truth and risks making git-warp
   claim Continuum authority it does not own.

## Decision

Implement a runtime-backed `Optic` noun in git-warp first, then project it into
public or Continuum-facing context as needed. Keep Continuum-native witnesshood
out of scope and use existing translated evidence posture until native evidence
exists.

## Proof Surface

Required proof:

- unit tests for `Optic` construction and validation;
- unit tests proving fluent path lowering creates `Optic` values before reads;
- conformance tests proving node, property, neighborhood, and traversal optics
  keep checkpoint-tail boundedness behavior;
- consumer typecheck if `Optic` is exported;
- docs guard updating glossary/readme/topic status only after runtime tests
  pass.

## Implementation Slices

1. RED: add failing tests for a missing first-class `Optic` noun and fluent-path
   lowering.
2. Add runtime-backed `Optic` construction for node and node-property reads.
3. Extend the noun to neighborhood and traversal support posture.
4. Route fluent execution through reified optics.
5. Add public export and consumer evidence if release scope requires the noun to
   be public.
6. Update docs, glossary, changelog, and release evidence after runtime truth
   lands.

## Tests To Write First

- `test/unit/domain/services/optic/Optic.test.ts`
- `test/unit/domain/services/optic/WorldlineOptic.test.ts`
- `test/conformance/v18ReifiedOpticReadBasis.test.ts`
- `test/unit/scripts/runtime-noun-doc-graph.test.ts`
- `test/type-check/consumer.ts` export assertions, if public

## Acceptance Criteria

- `Optic` is a frozen runtime-backed domain noun with constructor validation.
- Fluent node/property/neighborhood/traversal reads lower through `Optic`.
- No first-use optic path calls full materialization helpers when bounded basis
  evidence is absent.
- Docs no longer say "no first-class optic noun exists" after runtime evidence
  lands.
- `v18.1.0` release evidence names this cycle as a hard ship gate.

## Validation Plan

Run the targeted suite first:

```bash
npx vitest run test/unit/domain/services/optic/Optic.test.ts \
  test/unit/domain/services/optic/WorldlineOptic.test.ts \
  test/conformance/v18ReifiedOpticReadBasis.test.ts
```

Then run release-relevant guards:

```bash
npm run lint
npm run typecheck
npm run typecheck:consumer
npm run release:guard
```

## Playback / Witness

The cycle witness is a committed test run plus a release evidence note under
`docs/releases/v18.1.0/README.md` naming:

- the issue;
- the design doc;
- the exact tests proving reification;
- the docs/glossary status transition;
- any residual limitation that keeps `Optic` in `transition` instead of
  `shipped`.

## Risks

- Naming a public `Optic` too early could freeze a smaller API than the
  canonical model needs.
- Routing all fluent reads through a new noun could accidentally widen support
  or change failure semantics.
- Continuum wording could overclaim native witnesshood.

## Follow-On Debt

- Native Continuum optic witnesshood belongs to later Continuum/Wesley work.
- Full materialization-plan nouns remain separate from `Optic`.
- Support fragment cache storage is still a later execution concern.

## Tracker Disposition

The GitHub issue for this cycle must carry exactly one label from each live
axis:

- `type:feature`
- `priority:asap`
- `status:active`
- `area:api`

It should be assigned to the `v18.1.0` milestone when that milestone exists.

## Done Does Not Mean

Done does not mean all future optic theory is implemented. Done means the v18.1
release no longer teaches `Optic` as a first-class noun without a runtime object
behind it.

## Retrospective

TBD after implementation and validation.
