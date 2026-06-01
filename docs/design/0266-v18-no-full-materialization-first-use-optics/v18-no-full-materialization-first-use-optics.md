---
cycle: 0266
task_id: API_no-full-materialization-first-use-optics
status: Planned
github_issue_url: https://github.com/git-stunts/git-warp/issues/546
sponsors:
  human: James
  agent: Codex
started_at: 2026-06-01
release_home: v18.0.0
backlog:
  - docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v18.0.0/API_no-full-materialization-first-use-optics.md
  - docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v18.0.0/API_optics-public-api-closeout.md
issues:
  - https://github.com/git-stunts/git-warp/issues/546
  - https://github.com/git-stunts/git-warp/issues/547
---

# v18 No Full Materialization In First-Use Optics

## Method Contract

| Field | Value |
| --- | --- |
| Sponsor human | Product architect and release operator |
| Sponsor agent | Runtime/API closeout implementer |
| Hill | Before `v18.0.0` can ship, the documented first-use Optics setup path avoids full graph materialization and fails closed when no bounded basis exists. |
| Agent playback question | Can tests prove the documented `openWarpWorldline(...).prepareOpticBasis() -> coordinate() -> optic()` path does not call full materialization, full snapshot cloning, or full node/edge collection? |
| Human playback question | Can a newcomer read the public docs and understand exactly how to prepare or verify an Optic basis without being taught to build a second graph API or use materialization as an app read model? |
| Accessibility posture | The user-facing path must be readable linearly: open worldline, prepare or verify basis, capture coordinate, read through the coordinate, recover from named errors. |
| Localization posture | Public prose should use literal operational language. Code identifiers remain untranslated; cost labels use stable ASCII names. |
| Agent inspectability posture | The release gate must be machine-checkable through tests, source scans, and docs guards, not inferred from chat or design intent. |
| Non-goals | Full bounded-memory productization, native Continuum witnesshood, storage-plane retirement, and broad graph query replacement. Bounded-memory productization is covered by a separate v18 gate. |

## Evidence Sources

| Source | Relevant evidence |
| --- | --- |
| `src/domain/WarpWorldline.ts` | `openWarpWorldline()` currently implements `prepareOpticBasis()` by calling `graph.materialize()` and then `graph.createCheckpoint()`. |
| `test/conformance/v18CoordinateOpticPublicPath.test.ts` | Public coordinate Optic tests prove success and recovery shape, but they do not yet prove basis setup avoids materialization. |
| `docs/READINGS_AND_OPTICS.md` | First-use Optics docs teach `prepareOpticBasis()` before `coordinate()`, which makes setup cost part of the product claim. |
| `docs/API_REFERENCE.md` | API wording says `prepareOpticBasis()` may perform runtime folding internally, which is too soft for the new gate. |
| `docs/BEARING.md` | Current signpost names the setup materialization as a v18 blocker. |
| GitHub issue #547 and archived `API_optics-public-api-closeout.md` | Coordinate Optics closeout is branch-local implementation evidence but blocked by this release honesty gate. |

## Problem Statement

The v18 public story now starts from `openWarpWorldline()`. That is the right
product direction, but the current Optics setup helper violates the story it
appears to sell. A user can follow first-use docs, call
`prepareOpticBasis()`, and unknowingly pay for full graph materialization
before a checkpoint-tail basis is returned.

That is not a harmless implementation detail:

- production graphs already exist that cannot fit in memory;
- public docs make `prepareOpticBasis()` look like the normal way to enter
  bounded Optics;
- the coordinate read path already has the correct failure posture through
  `E_OPTIC_NO_BOUNDED_BASIS`, but setup currently bypasses that posture by
  building its basis through full residency;
- a newcomer should not learn materialization as an application read model;
- any "bounded Optics" release claim is false while setup hides a whole-graph
  fold.

The immediate v18 gate is therefore narrow and strict: first-use Optics setup
must not perform full graph materialization. If a bounded basis cannot be
verified or built without full residency, setup fails closed with a named
recovery path.

## Product Rule

```text
No documented first-use public API may require full graph materialization.
No bounded-looking API may hide a full-residency provider behind streaming or
Optics-shaped syntax.
```

For this gate, "full graph materialization" includes:

- calls to public `materialize()` or internal `_materializeGraph()`;
- creation or cloning of a complete `WarpState`;
- construction of full node or edge arrays for setup;
- observer snapshot cloning as a hidden setup dependency;
- checkpoint creation that depends on a freshly materialized full state;
- any helper that requires the whole graph or whole index to fit in memory.

## API Cost Labels

Public surfaces must use explicit cost labels. This gate introduces the labels;
the large-graph product gate enforces them everywhere.

| Label | Meaning | First-use docs |
| --- | --- | --- |
| `bounded` | Enforces memory and result limits. | Allowed. |
| `streaming` | Does not accumulate internally and does not read from a full-residency provider. | Allowed. |
| `cursor` | Returns a resumable bounded window. | Allowed. |
| `transitional` | Directionally correct public surface whose current provider is not fully bounded. | Mention only with caveats. |
| `diagnostic` | May require full residency for inspection, repair, or operator use. | Not allowed as first-use app path. |
| `offline` | Intended for controlled tooling, migration, or maintenance windows. | Not allowed as first-use app path. |
| `legacy` | Kept for compatibility; not the intended new model. | Not allowed as first-use app path. |

The important nuance is that shapes are not banned forever. Exact reads such as
`node(id).props()` can be bounded when backed by fact indexes. The current
provider determines the current label.

## Required Behavior

### `prepareOpticBasis()`

`prepareOpticBasis()` must become one of these, in order of preference:

1. A bounded basis verifier: it checks for an existing checkpoint-tail or read
   basis that was produced by a bounded process and returns a receipt.
2. A bounded basis builder: it stream-builds or shard-builds the basis under an
   explicit budget.
3. A fail-closed setup method: it returns or throws the existing
   `E_OPTIC_NO_BOUNDED_BASIS` recovery path when no bounded basis exists.

It must not call `graph.materialize()` as a setup convenience.

### `coordinate()`

`coordinate()` must keep its current role: capture a stable causal position for
coherent Optic reads. It must not manufacture a basis by materializing. If no
bounded basis exists, it fails closed with `E_OPTIC_NO_BOUNDED_BASIS`.

### `coordinate.optic()`

Coordinate Optics must continue to:

- return ordinary absence as data;
- include read identity evidence;
- reject unsupported bases instead of silently falling back to materialization;
- surface tail-budget and read-identity errors distinctly.

### `events.optic()`

The one-off live convenience may remain public, but it must be labeled
`transitional` unless its provider is proven bounded. It is not the coherent
multi-read boundary and must not be the first-use Optics story.

## Implementation Strategy

### Step 1: Source Inventory

Create a public API cost inventory that classifies:

- `openWarpWorldline()`;
- `prepareOpticBasis()`;
- `coordinate()`;
- `coordinate.optic()`;
- `events.optic()`;
- `live().getNodeProps(id)` and other exact reads;
- `query()` and `toArray()`-like result surfaces;
- `getNodes()`, `getEdges()`, and `getStateSnapshot()`;
- `materialize()`, `materializeAt()`, `materializeCoordinate()`, and
  `materializeStrand()`;
- sync response surfaces;
- content byte streaming and content-reference lookup.

The inventory should name both API shape and current provider cost. A good API
shape backed by a full-state provider is `transitional`, not `bounded`.

### Step 2: Tripwire Fixtures

Add first-use tripwire tests around documented Optics setup. The test harness
should fail if the path touches:

- `graph.materialize()`;
- `graph._materializeGraph()`;
- full `WarpState` snapshot creation;
- full node array construction;
- full edge array construction;
- observer snapshot cloning;
- any known full-residency helper introduced by future refactors.

The tripwire must be attached to the documented path, not only internal
checkpoint-tail fixtures.

### Step 3: Basis Verification Path

Introduce a basis lookup or verification seam. It should answer:

- Does a basis already exist for this worldline?
- Which checkpoint or read-basis id proves it?
- Which frontier or tail does it cover?
- Was it produced by a bounded process?
- Is it fresh enough for the requested coordinate?
- Which error should be returned if it is absent or stale?

For v18, an existing bounded basis can be enough. Streaming basis construction
belongs to the large-graph gate, but this gate must not fall back to full
materialization when a bounded basis is absent.

### Step 4: Fail-Closed Setup

If no bounded basis exists, `prepareOpticBasis()` must fail closed. The failure
should use the established Optic error language, especially
`E_OPTIC_NO_BOUNDED_BASIS`, and public docs must explain recovery without
teaching users to materialize.

Potential recovery wording:

- run an operator command that builds the basis under a memory budget;
- refresh the bounded basis when tail budget is exceeded;
- use a live worldline read when Optic identity is not needed;
- use diagnostic full-residency APIs only in controlled offline tooling.

### Step 5: Docs And Guardrails

Docs must be updated so a newcomer sees:

1. open a worldline;
2. commit patches;
3. use live exact reads for ordinary product reads;
4. prepare or verify an Optic basis through the bounded path;
5. capture a coordinate;
6. read through `coordinate.optic()`;
7. interpret named errors.

Docs must not show `materialize()`, `getNodes()`, `getEdges()`, or
`getStateSnapshot()` as first-use application reads.

## Acceptance Criteria

- A test fails if `prepareOpticBasis()` calls `materialize()` or
  `_materializeGraph()` on the first-use path.
- A test fails if first-use Optics setup creates or clones a full graph
  snapshot.
- `prepareOpticBasis()` either verifies/builds a bounded basis or fails closed
  with `E_OPTIC_NO_BOUNDED_BASIS`.
- Public docs classify Optics setup as bounded, streaming, cursor,
  transitional, diagnostic, offline, or legacy with no ambiguous wording.
- README, API reference, Readings and Optics, migration docs, and release notes
  do not teach materialize-first app reads.
- Consumer type tests still prove the intended public coordinate Optic chain.
- Existing coordinate Optic success tests still pass through read identity
  evidence.
- The release blocker card links this design, the tests, and the final
  playback witness.

## Test Plan

- Add a conformance test for `openWarpWorldline().prepareOpticBasis()` with a
  materialization spy or trap.
- Add a docs guard that rejects first-use examples containing `materialize()`,
  `getNodes()`, `getEdges()`, or `getStateSnapshot()`.
- Add an API reference guard for cost labels on every public read surface named
  in this design.
- Add a recovery test proving missing bounded basis produces
  `E_OPTIC_NO_BOUNDED_BASIS`.
- Keep existing coordinate Optic success, coherence, missing-node, and
  consumer type tests green.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Basis verification seam does not exist yet. | Add the narrowest read-basis lookup seam first; fail closed when absent. |
| Docs become too defensive for newcomers. | Keep first-use path short and put detailed cost labels in API reference tables. |
| Existing tests rely on materialized setup fixtures. | Keep diagnostic fixtures, but do not let them stand in for first-use evidence. |
| The large-graph product gate later changes basis shape. | Return an opaque receipt and keep public docs focused on behavior, not storage layout. |

## Playback Witness

The closeout witness must include:

- test command and output for the materialization tripwire;
- source links for the final `prepareOpticBasis()` implementation;
- docs guard output;
- public docs snippets showing the first-use path;
- a short release note excerpt stating the exact v18 Optics claim.
