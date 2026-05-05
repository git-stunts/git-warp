---
report_id: "AUD-2026-05-04-CQ01"
title: "Code Quality Audit: git-warp v17 Release Branch"
status: "Final"
audit:
  date_started: 2026-05-04
  date_completed: 2026-05-04
  type: "Full"
  scope: "src/, test/, README.md, docs/, package release gates"
  compliance_frameworks: ["Project METHOD", "Anti-SLUDGE Policy", "Systems-Style TypeScript", "Release Runbook"]
target:
  repository: "github.com/git-stunts/git-warp"
  branch: "release/v17.0.0"
  commit_hash: "2209d3a5"
  language_stack: ["TypeScript 5.9", "Node.js 22+", "Vitest 4.1", "ESLint 9"]
  environment: "Pre-Release Local"
methodology:
  automated_tools: ["ESLint", "TypeScript Compiler", "Vitest", "npm audit", "npm outdated", "markdownlint", "Markdown code-sample linter", "ripgrep"]
  manual_review_hours: 4
  false_positive_rate: "Low"
summary:
  total_findings: 10
  severity_count:
    critical: 1
    high: 6
    medium: 3
    low: 0
  remediation_status: "Pending"
related_reports:
  previous_audit: "AUD-2026-04-14-CQ01"
  tracking_ticket: "docs/method/backlog/bad-code"
---

# Code Quality Audit

## Evidence Checked

Automated gates on `release/v17.0.0` at `2209d3a5`:

| Command | Result | Notes |
|---------|--------|-------|
| `npm run lint` | PASS | Source lint passed. |
| `npm run typecheck` | PASS | Source and test TypeScript checks passed. |
| `npm run typecheck:consumer` | FAIL | `test/type-check/consumer.ts:318` still expects `graphBag.materialize.materialize()`. |
| `npm run test:local` | FAIL | 14 failed test files, 32 failed tests, 6741 passed tests. |
| `npm audit --omit=dev --audit-level=high` | PASS | No high production dependency vulnerabilities reported by npm audit. |
| `npm run lint:md` | PASS | Markdown lint passed before this audit. |
| `npm run lint:md:code` | PASS | Markdown code sample lint passed before this audit. |
| `npm outdated --json` | WARN | Several stale packages; no direct high vulnerability found. |

The audit also sampled the current public API, read-path controllers,
checkpoint loading, documentation entry points, and release tests.

## 0. Executive Report Card

| Metric | Score (1-10) | Recommendation |
|--------|--------------|----------------|
| Developer Experience (DX) | 4 | Best of: `openWarpGraph()` now has a clear capability-bag shape in `src/domain/WarpGraph.ts:93-113`. |
| Internal Quality (IQ) | 4 | Watch Out For: materialization is half-deleted, leaving public docs, consumer tests, and internal controllers in conflict. |
| Overall Recommendation | THUMBS DOWN | Justification: the branch fails release gates and still contains hidden `_materializeGraph()` dependencies despite the v17 API direction. |

## 1. DX: Ergonomics and Interface Clarity

### 1.1. Time-to-Value Score

**Answer:** 4/10.

The biggest TTV drag is that the first code sample teaches a call that
is no longer on the public `WarpGraph` surface. `README.md:37-38`
still says to fold by calling `await graph.materialize.materialize({});`,
while `src/domain/WarpGraph.ts:93-113` exposes `query`, `patches`,
`sync`, `strands`, `checkpoint`, `provenance`, `comparison`, and
`subscriptions`, with no public `materialize` capability.

The core setup is otherwise reasonable: create plumbing, wrap it in
`GitGraphAdapter`, call `openWarpGraph()`, then write and read. The
problem is that the first read path sends new users through a removed
mental model.

**Action Prompt (TTV Improvement):**

```text
Update the README and Getting Started quick-start flow so the first successful read uses the v17 reading surface, not `graph.materialize.materialize({})`. Add a RED docs-code regression test that imports `openWarpGraph`, writes a patch through `graph.patches`, then reads through `graph.query.worldline()` or the blessed optic/reading API without any public `materialize` call. Green the test by editing README.md, docs/GETTING_STARTED.md, and any linked API snippets. Do not add compatibility shims for `graph.materialize`.
```

### 1.2. Principle of Least Astonishment

**Answer:** The most significant POLA violation is the mixed signal
around materialization. The public `WarpGraph` interface omits
`materialize`, but `WarpGraphDeps` still exposes `autoMaterialize`
at `src/domain/WarpGraph.ts:145`, error messages still say "Call
materialize()", and several controllers still perform hidden
`_materializeGraph()` work.

A developer would intuitively expect a v17 API built around Optics and
Readings over causal worldlines to expose explicit read handles and
bounded read methods. They would not expect a hidden whole-graph replay
to be triggered by observers, sync, subscriptions, checkpoint helpers,
or patch freshness checks.

**Action Prompt (Interface Refactoring):**

```text
Remove the remaining public and semi-public materialization vocabulary from the v17 WarpGraph API contract. Start with RED consumer type tests proving that `WarpGraphDeps` has no `autoMaterialize`, `WarpGraph` has no `materialize`, and the blessed read path is expressed through query/worldline/optic/reading capabilities. Then remove `autoMaterialize` from `WarpGraphDeps`, replace stale error guidance with reading-specific remediation, and update any capability documentation to describe checkpointing as an internal folding artifact rather than a public materialization command.
```

### 1.3. Error Usability

**Answer:** Read/provenance errors are now actively misleading.
`src/domain/services/controllers/ProvenanceController.ts:31`,
`:37`, `:51`, `:57`, and `:99` instruct callers to call
`materialize()` or `materialize({ ceiling })`. `src/domain/RuntimeHost.ts:468`
throws `No materialized state. Call materialize() before querying.`

For v17, the error should name the failed reading basis and the
supported recovery route. Example:

```text
No live reading basis is available for provenance. Open a worldline reading or create a checkpoint-backed reading before requesting provenance. See docs/GUIDE.md#readings-and-provenance.
```

**Action Prompt (Error Handling Fix):**

```text
Replace materialization-era read/provenance error messages with v17 reading-basis diagnostics. Add RED tests for ProvenanceController.patchesFor(), materializeSlice(), RuntimeHost cached-state failures, and QueryStateMessages that assert the errors mention the missing reading basis, the affected operation, and docs/GUIDE.md#readings-and-provenance. Green by introducing a small ReadingErrorMessage module with named messages and codes; remove all "Call materialize()" guidance from src/domain/services/controllers and src/domain/errors.
```

## 2. DX: Documentation and Extendability

### 2.1. Documentation Gap

**Answer:** The missing high-friction content is a user-facing guide for
Optics and Readings over causal worldlines. The docs contain design
documents such as `docs/design/0111-v17-optics-causal-slice-architecture.md`,
but the user-facing docs still frame reads as materialization:
`docs/GETTING_STARTED.md:92-95`, `docs/API_REFERENCE.md:802-803`,
and `docs/API_REFERENCE.md:2219`.

The result is an API migration without an onboarding path. A developer
can discover individual methods, but not the conceptual replacement
for materializing a graph.

**Action Prompt (Documentation Creation):**

```text
Create docs/READINGS_AND_OPTICS.md as the v17 replacement for materialization-era read guidance. Cover live worldline reads, pinned coordinate reads, observer/aperture reads, checkpoint-backed readings, provenance reads, and what operations intentionally remain substrate/tooling-only. Link it from README.md, docs/GETTING_STARTED.md, docs/GUIDE.md, and docs/API_REFERENCE.md. Add a docs-code test that exercises every public snippet without calling `graph.materialize`, `graph.materialize.materialize`, or `_materializeGraph`.
```

### 2.2. Customization Score

**Answer:** 6/10.

The robust extension points are the typed ports accepted by
`openWarpGraph()` in `src/domain/WarpGraph.ts:132-165`: persistence,
logger, crypto, codec, seek cache, blob storage, patch journal,
checkpoint store, index store, and effect sinks. This is the strongest
DX and architecture feature in the current branch.

The weakest extension point is read freshness. Controllers still
depend on host internals such as `_cachedState`, `_materializedGraph`,
`_stateDirty`, and `_materializeGraph()` instead of an explicit
reading/read-model port. That makes external customization hard
because the extension boundary is not a named capability.

**Action Prompt (Extension Improvement):**

```text
Introduce a ReadingModelPort owned by the domain read surface. The port should expose explicit operations for current worldline reads, pinned coordinate reads, checkpoint-backed reads, and provenance basis access. Write RED tests showing QueryController, SubscriptionController, CheckpointController, PatchController, and SyncController can operate against the port without calling `_materializeGraph`. Green by moving freshness and cached-read decisions behind the new port, keeping existing public query methods stable.
```

## 3. Internal Quality: Architecture and Maintainability

### 3.1. Technical Debt Hotspot

**Answer:** `src/domain/RuntimeHost.ts` is the highest-debt hotspot.
It is 917 LOC, well above the repo's 500 LOC source limit. It owns
composition, controller construction, materialization, cached state,
adjacency, view building, subscriptions, provenance, checkpoint
integration, GC state, and runtime delegation. The sampled excerpt at
`src/domain/RuntimeHost.ts:360-379` wires controllers and services,
while `src/domain/RuntimeHost.ts:393-495` owns materialization and
cache mutation.

This is not just size. The class remains the ambient center of gravity
for state freshness and read-model decisions, which is why several
controllers still reach into its internals.

**Action Prompt (Debt Reduction):**

```text
Incrementally split RuntimeHost by ownership without changing the public openWarpGraph surface. Start with RED characterization tests for current cache-state behavior around reads, checkpoints, subscriptions, and sync. Then extract a RuntimeReadModelOwner that owns `_cachedState`, `_stateDirty`, `_materializedGraph`, adjacency/provider construction, and state-hash updates. RuntimeHost should wire the owner and expose only typed methods required by controllers. Keep each new source file under 500 LOC and remove direct controller mutation of read cache fields.
```

### 3.2. Abstraction Violation

**Answer:** The clearest SoC violation is public read orchestration
calling a whole-graph materialization primitive. `QueryController`
defines `MaterializableHost` with `_materializeGraph()` at
`src/domain/services/controllers/QueryController.ts:57-59`, then calls
it in `snapshotCurrent()` at `:74-76` and detached live reads at
`:120-129`. `SyncController` calls `_host._materializeGraph()` at
`src/domain/services/controllers/SyncController.ts:334-335` and
`:357-358`.

The appropriate pattern is a dedicated read-model/read-basis port. A
controller should ask for a reading basis, not materialize a graph.

**Action Prompt (SoC Refactoring):**

```text
Extract read-basis resolution out of controllers into a dedicated ReadingBasisService and port. Write RED tests that install a throwing `_materializeGraph` trap and prove QueryController observer reads, SyncController materialize=false sync, SubscriptionController polling, and CheckpointController read paths do not call it. Green by replacing controller host dependencies with ReadingBasisService methods such as `currentWorldlineSnapshot()`, `pinnedSnapshot(source)`, and `provenanceBasis()`. Delete controller-level `_materializeGraph` requirements.
```

### 3.3. Testability Barrier

**Answer:** The primary barrier is that many tests are coupled to
private host implementation details rather than public behavior.
Examples include `test/type-check/consumer.ts:315-318`, which still
expects `graph.materialize()` and `graphBag.materialize.materialize()`,
and tests such as `test/unit/domain/WarpGraph.adjacencyCache.test.ts`
that inspect `_materializedGraph` and `_materializeGraph` behavior.

This coupling made the materialization deletion appear partial:
removing the public API exposed stale tests, while production internals
still had enough old seam to keep some implementation-oriented tests
alive.

**Action Prompt (Testability Improvement):**

```text
Replace materialization-internal test seams with behavior-first reading tests. Build a small ReadingHarness that opens a real in-memory graph, writes patches, and reads through public query/worldline/observer/optic APIs. Add RED tests proving hidden materialization traps are not invoked for blessed reads. Migrate stale adjacency/materialize tests to assert observable cache and reading behavior, not `_materializedGraph` fields or `_materializeGraph` calls. Remove graph.materialize expectations from consumer type tests.
```

## 4. Internal Quality: Risk and Efficiency

### 4.1. The Critical Flaw

**Answer:** The critical flaw is release-contract inconsistency. The
branch is meant to ship v17 with materialization removed from the public
API, but:

- `npm run typecheck:consumer` fails because `test/type-check/consumer.ts:318`
  expects `graphBag.materialize.materialize()`.
- `npm run test:local` fails with 32 failing tests across 14 files.
- Production controllers still call `_materializeGraph()`.
- README and Getting Started still direct users through materialization.

This means the package cannot be honestly released: tests, docs,
types, and runtime behavior disagree about the core contract.

**Action Prompt (Risk Mitigation):**

```text
Run a v17 materialization deletion closeout. First add RED contract tests that fail if public docs, consumer types, or blessed read controllers expose or call `materialize`, `graph.materialize.materialize`, or `_materializeGraph`. Then green by removing the public type residue, replacing controller calls with reading-basis services, updating docs, and deleting/rewriting stale materialization tests. Finish only when `npm run typecheck:consumer`, `npm run test:local`, `npm run lint`, and `npm run typecheck` all pass.
```

### 4.2. Efficiency Sink

**Answer:** The biggest efficiency sink is fallback to full
materialization for read-adjacent operations. `RuntimeHost._materializeGraph()`
at `src/domain/RuntimeHost.ts:429-442` calls
`MaterializeController.materialize()` and then builds adjacency/state
hashes. Controllers call this path in query, sync, checkpoint, patch,
and subscription code. That violates the v17 bounded-read goal and
risks whole-graph residency even when a caller only needs a small
worldline/optic reading.

**Action Prompt (Optimization):**

```text
Optimize read-adjacent paths by replacing full materialization fallback with indexed, checkpoint-backed, bounded reads. Add RED performance/regression tests that write a large graph, install a throwing `_materializeGraph` trap, and prove exact-id reads, observer reads, sync without materialize=true, and subscription polling do not enter full replay. Green by routing those paths through checkpoint tail optics or an indexed ReadingModelPort, and add budget assertions for max patch loads and max resident state size.
```

### 4.3. Dependency Health

**Answer:** No high-severity production dependency vulnerability was
reported by `npm audit --omit=dev --audit-level=high`. Dependency
freshness still needs attention. `npm outdated --json` reports
`@git-stunts/alfred` at `0.4.0` while latest is `0.10.3`, plus stale
tooling (`eslint`, `vitest`, `typescript-eslint`, `typescript`) and
runtime packages (`cbor-x`, `zod`, `boxen`, `string-width`,
`wrap-ansi`).

The most relevant dependency to update first is `@git-stunts/alfred`
because sync retry/timeout behavior depends on it.

**Action Prompt (Dependency Update):**

```text
Safely update @git-stunts/alfred from 0.4.0 to the latest stable 0.10.x line. Read its changelog for timeout/retry API changes, then update package.json and package-lock.json. Add or update sync retry tests around timeout, abort, retry exhaustion, and status callbacks. Run `npm run lint`, `npm run typecheck`, `npm run test:local`, and `npm run typecheck:consumer`. Do not bundle unrelated major upgrades such as zod v4 or TypeScript v6 into the same commit.
```

## 5. Strategic Synthesis and Action Plan

### 5.1. Combined Health Score

**Answer:** 4/10.

The architecture has strong foundations, especially hexagonal ports and
a capability-oriented composition root. The branch is not release-ready
because the core public contract is inconsistent across docs, types,
runtime internals, and tests.

### 5.2. Strategic Fix

**Answer:** Delete the materialization seam all the way through the
v17 contract and replace it with a named reading-basis service/port.
This improves DX by making the public API match the README and error
guidance, and it improves IQ by removing the hidden whole-graph replay
dependency from controllers.

### 5.3. Mitigation Prompt

**Action Prompt (Strategic Priority):**

```text
Complete the v17 read-contract migration from materialization to Optics and Readings. Start by adding RED tests in consumer type checks, public docs snippets, QueryController, SyncController, SubscriptionController, PatchController, and CheckpointController proving that public reads and read-adjacent operations do not expose or call `materialize`, `graph.materialize.materialize`, or `_materializeGraph`. Introduce a ReadingBasisService/ReadingModelPort that owns current worldline, pinned coordinate, checkpoint-backed, and provenance reading bases. Green by routing controllers through that service, deleting stale public type/docs references, rewriting materialization-internal tests as behavioral reading tests, and keeping substrate-only replay APIs isolated behind clearly named tooling surfaces. Finish with lint, typecheck, consumer typecheck, test:local, markdown lint, and markdown code-sample lint passing.
```
