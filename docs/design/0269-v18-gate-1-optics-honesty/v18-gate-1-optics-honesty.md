---
cycle: 0269
task_id: v18-gate-1-optics-honesty
status: In Progress
gate: 1
github_issue_url: https://github.com/git-stunts/git-warp/issues/546
sponsors:
  human: James
  agent: Codex
started_at: 2026-06-01
release_home: v18.0.0
issues:
  - https://github.com/git-stunts/git-warp/issues/546
  - https://github.com/git-stunts/git-warp/issues/547
  - https://github.com/git-stunts/git-warp/issues/549
  - https://github.com/git-stunts/git-warp/issues/552
  - https://github.com/git-stunts/git-warp/issues/548
  - https://github.com/git-stunts/git-warp/issues/551
  - https://github.com/git-stunts/git-warp/issues/553
  - https://github.com/git-stunts/git-warp/issues/572
  - https://github.com/git-stunts/git-warp/issues/573
---

# v18 Gate 1 Optics Honesty

## Method Contract

| Field | Value |
| --- | --- |
| Sponsor human | James |
| Sponsor agent | Codex |
| Hill | Before the bounded-memory platform work begins, v18 first-use Optics stop hiding full graph materialization, and the tracker reflects only live blockers. |
| Agent playback question | Can tests prove `openWarpWorldline().prepareOpticBasis()` verifies existing checkpoint-tail evidence or fails closed without calling full materialization, snapshot cloning, full node/edge collection, or observer snapshot setup? |
| Human playback question | Can a newcomer read first-use docs and understand that Optic setup verifies existing checkpoint-tail basis evidence, not that git-warp folded the whole graph for them? |
| Accessibility posture | The public path stays linear: open worldline, commit, verify basis, coordinate, optic read, recover from named errors. Cost labels are text tables, not visual-only cues. |
| Localization posture | Cost labels are stable ASCII identifiers. Public prose avoids idioms where operational recovery matters. |
| Agent inspectability posture | The gate leaves source tests, docs guards, a cost inventory, and GitHub issue disposition comments. Future agents can audit it without chat context. |
| Non-goals | Memory pool implementation, streaming basis construction, sharded fact resolvers, cursorized sync, bounded content lookup, and final v18 tag/publish operation. Those remain gate 2 and release-operation work. |

## Gate Scope

Gate 1 covers slices 153 through 157:

| Slice | Issue | Deliverable |
| --- | --- | --- |
| 153 | `#572`, `#573`, `#548`, `#551`, `#553`, `#552` | Reconcile tracker truth after PR #111 and close migrated or completed historical evidence issues. |
| 154 | `#546`, `#549`, `#552` | Add a public API cost inventory that names API shape, current provider, and first-use eligibility. |
| 155 | `#546`, `#549` | Add first-use materialization tripwires for the documented Worldline Optics setup path. |
| 156 | `#546`, `#547` | Add documentation guards keeping first-use examples off diagnostic, offline, and legacy full-residency APIs. |
| 157 | `#546` | Change `prepareOpticBasis()` so it verifies existing checkpoint-tail basis evidence or fails closed with `E_OPTIC_NO_BOUNDED_BASIS`. |

Gate 1 is deliberately not the large-graph product gate. It removes the
dishonest first-use path and makes the next gate executable without ambiguous
public claims.

## Current Problem

Before this gate, `openWarpWorldline()` was the correct public entry point, but
its `prepareOpticBasis()` implementation did this:

```text
graph.materialize() -> graph.createCheckpoint() -> WarpWorldlineOpticBasis
```

That is disqualifying for the v18 Optics honesty claim. A caller can follow the
README, believe they are entering a bounded Optic path, and instead trigger a
full graph fold before coordinate capture.

The runtime already has checkpoint-tail basis readers for Optic reads. Gate 1
routes `prepareOpticBasis()` through setup verification when existing basis
evidence is present and fails closed when it is absent. It deliberately does not
claim memory-budgeted basis verification; that remains gate 2.

## Product Rule

```text
No documented first-use public API may require full graph materialization.
No bounded-looking API may hide a full-residency provider behind streaming or
Optics-shaped syntax.
```

For gate 1, full graph materialization includes:

- `materialize()`;
- `_materializeGraph()`;
- full `WarpState` snapshot creation or cloning;
- full node arrays;
- full edge arrays;
- observer snapshot setup as an Optics setup dependency;
- checkpoint creation that depends on a freshly materialized full state.

## Tracker Disposition

Gate 1 also cleans up the migrated issue truth:

| Issue | Disposition |
| --- | --- |
| `#572` GitHub Issues Method tracker migration | Completed by PR #111 and closed. |
| `#573` PR issue-reference action | Completed by PR #111 and closed. |
| `#548` Graph-model migration tool | Completed by earlier v18 migration slices; release operation remains in `#552`. |
| `#551` Legacy props as projection | Public property projection work complete; residual storage risk remains documented separately. |
| `#553` Genesis replay equivalence | Migration/equivalence evidence complete; final preflight remains in `#552`. |
| `#546` No full materialization in first-use Optics | Active gate 1 implementation issue. |
| `#547` Optics public API closeout | Remains blocked by gate 1 and gate 2 until public success paths are bounded. |
| `#552` v18 public release blockers | Remains the release umbrella. |

## API Cost Inventory

Gate 1 adds a repository-visible cost inventory with these labels:

| Label | Meaning | First-use docs |
| --- | --- | --- |
| `bounded` | Enforces memory and result limits. | Allowed. |
| `streaming` | Does not accumulate internally and does not read from full-residency state. | Allowed. |
| `cursor` | Returns a resumable bounded window. | Allowed. |
| `transitional` | Public shape points in the right direction, but the current provider is not yet fully bounded. | Mention only with caveats. |
| `diagnostic` | May require full residency for inspection, repair, or operator evidence. | Not allowed as first-use app path. |
| `offline` | Intended for controlled migration or maintenance windows. | Not allowed as first-use app path. |
| `legacy` | Compatibility surface, not the new product model. | Not allowed as first-use app path. |

The inventory must separate API shape from provider truth. For example,
`getNodeProps(id)` is a useful exact-read shape, but the current provider is
not yet a bounded shard resolver. That makes it `transitional`, not forbidden
forever and not honestly `bounded` today.

## Implementation Plan

### 1. Source And Docs Inventory

Add a machine-readable cost inventory under docs. Tests assert that key public
surfaces are classified and that first-use docs point readers to the inventory.

Required classifications include:

- `openWarpWorldline()`;
- `prepareOpticBasis()`;
- `coordinate()`;
- `coordinate.optic()`;
- `events.optic()`;
- exact live reads such as `live().getNodeProps(id)`;
- `query().run()`;
- `getNodes()`, `getEdges()`, and `getStateSnapshot()`;
- public materialize methods;
- content byte streams and content-reference lookup;
- sync array responses and sync materialization options.

### 2. Tripwire The First-Use Path

Add a conformance test around the documented sequence:

```text
openWarpWorldline() -> prepareOpticBasis() -> coordinate() -> coordinate.optic()
```

The test fixture may pre-create checkpoint-tail evidence as operator setup, but
the path under test must fail if `prepareOpticBasis()` calls full residency.

### 3. Verify Existing Basis Or Fail Closed

Replace the `graph.materialize()` setup path with checkpoint-tail basis
verification. The verifier checks checkpoint message schema and basis evidence
without loading full checkpoint state, deserializing checkpoint frontier bytes,
or building the read-basis shard maps.

If no checkpoint-tail basis exists, `prepareOpticBasis()` throws
`E_OPTIC_NO_BOUNDED_BASIS` with recovery context. It does not call
`createCheckpoint()` as a fallback in this gate.

### 4. Adjust Public Tests

Public coordinate Optics tests should model two separate concerns:

- an operator-prepared checkpoint-tail basis can be verified by first-use worldline
  code without materialization;
- absent checkpoint-tail basis fails closed with the same error family used by Optic
  reads.

The existing branch-local public success tests remain valuable, but their setup
must not imply the public helper builds a full-state checkpoint for users.

### 5. Documentation Guard

Docs must state that `prepareOpticBasis()` verifies existing checkpoint-tail
evidence in gate 1. They must not imply that first-use
application code can safely create a basis by folding the whole graph.

First-use docs may mention diagnostic/offline/legacy APIs only as caveats, not
as the recommended app path.

## Acceptance Criteria

- `prepareOpticBasis()` has no call to `materialize()`.
- `prepareOpticBasis()` has no call to `createCheckpoint()` in gate 1.
- First-use Optics tripwire tests fail on checkpoint state blob reads, patch
  blob reads, checkpoint writes, and known source-level calls to `materialize()`,
  `_materializeGraph()`, full snapshot cloning, full node array creation, full
  edge array creation, or observer snapshot setup.
- Existing checkpoint-tail evidence can be verified through
  `prepareOpticBasis()` and then used by `coordinate().optic()`.
- Missing basis fails closed with `E_OPTIC_NO_BOUNDED_BASIS`.
- Docs include cost labels, no longer say `prepareOpticBasis()` creates a basis
  by internal runtime folding, and classify Optics setup/read paths as
  `transitional` until gate 2 adds memory-budgeted providers.
- The Method tracker reflects closed migrated/completed evidence issues and
  leaves `#546`, `#547`, `#549`, and `#552` as the meaningful release-blocking
  lane.

## Test Plan

- `test/conformance/v18CoordinateOpticPublicPath.test.ts` for the public
  worldline coordinate path.
- A new first-use tripwire test for `prepareOpticBasis()`.
- A new docs/cost-inventory guard under `test/unit/scripts`.
- Existing v18 package-surface, worldline docs, materialize classification, and
  release-story guard tests.
- Focused TypeScript checks for touched source and tests.

## Playback Witness

The gate closes when the PR contains:

- the design doc;
- issue disposition comments;
- cost inventory evidence;
- first-use materialization tripwires;
- fail-closed `prepareOpticBasis()` implementation;
- docs guards and public wording updates;
- focused green test output;
- a PR body referencing `#546`, `#547`, and `#552`.
