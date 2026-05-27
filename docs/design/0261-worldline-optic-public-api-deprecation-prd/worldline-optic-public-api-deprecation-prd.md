# Worldline/Optic-First Public API And Legacy Graph API Deprecation PRD

Feature name: Worldline/Optic-First Public API and Legacy Graph API Deprecation.

Feature description: make worldlines, observers, readings, and optics the primary
application-facing API for `@git-stunts/git-warp`. The existing graph and
materialization APIs remain compatible, but they become explicitly documented as
legacy, compatibility, or diagnostic surfaces instead of the first-use story.

## Evidence Sources

This PRD is grounded in the current repository and adjacent Continuum doctrine:

| Source | Relevant evidence |
|--------|-------------------|
| `README.md` | First-use example still imports `openWarpGraph()` and opens a graph before reading through a worldline. |
| `docs/API_REFERENCE.md` | `openWarpGraph()` is documented as the public entry point; legacy `WarpApp.open()` and `WarpCore.open()` are deprecated in favor of `openWarpGraph()`. |
| `docs/READINGS_AND_OPTICS.md` | The current read story already describes worldlines, observers, readings, and optics, but starts from `openWarpGraph() -> graph.patches -> graph.query`. |
| `src/domain/WarpGraph.ts` | `openWarpGraph()` returns a frozen capability bag with commitment, folding, revelation, and governance surfaces plus flat aliases. |
| `src/domain/services/Worldline.ts` | `Worldline` already supports direct reads, `seek()`, `observer()`, `query()`, `traverse()`, and bounded `optic()`. |
| `src/domain/capabilities/MaterializeCapability.ts` | Public `materialize()`, `materializeCoordinate()`, and `materializeAt()` methods remain exposed on the legacy capability surface. |
| `~/git/echo/docs/spec/SPEC-0004-worldlines-playback-truthbus.md` | Echo doctrine says worldlines retain witnessed history and observation artifacts are the public read contract. |
| `~/git/echo/docs/design/warp-optic-implementation-map.md` | Echo maps observer plans, optic slices, witnesses, and readings to distinct implementation evidence; query observers are read-only. |

## 1. Feature Overview & Objectives:

### Problem Statement

The v18 implementation is technically strong, but the current public story is
not yet compelling from a user perspective. A new user still learns to open a
graph, then discovers worldlines and optics as subordinate query features. That
framing undersells the system's actual direction:

- git-warp is a Continuum participant that exchanges witnessed causal history.
- A worldline is the retained causal history boundary a product can name and
  observe.
- An optic is the bounded observer-relative read contract that makes a read
  honest, reproducible, and comparable.
- Materialization is a substrate operation, compatibility adapter, or diagnostic
  technique, not the product concept that users should build around.

The release story should therefore shift from "open a graph and materialize it"
to "open a worldline, commit causal facts, and read through optics." Legacy APIs
must continue to work, but they must stop being the default mental model.

### Target User/Audience

| Persona | Needs |
|---------|-------|
| Application developer | Wants a stable API for writing and reading product state without learning internal materialization machinery first. |
| Agent/tooling integrator | Wants to operate over reproducible worldline coordinates and observation artifacts that can align with Echo, Wesley, Continuum, and `warp-ttd`. |
| Migration operator | Wants v17/v18 code to keep working while receiving explicit replacement paths for graph-first and materialize-first calls. |
| Maintainer/release manager | Wants a release claim that is honest, test-backed, and narrow enough to ship without risky storage removal. |

### Objectives

1. Introduce a first-class public API centered on a named worldline handle, not a
   graph capability bag.
2. Expose reads through worldlines, observers, readings, and bounded optics
   without exposing full-state materialization as the first-use path.
3. Deprecate legacy public graph-opening and public materialize methods with
   precise replacement guidance and compatibility guarantees.
4. Keep the implementation conservative: wrap the existing runtime where
   possible, avoid storage rewrites, and do not claim native Continuum
   witnesshood or end-to-end graph streaming yet.

### Measurable Success Metrics (KPIs)

| KPI | Target |
|-----|--------|
| First-use documentation alignment | `README.md`, `docs/API_REFERENCE.md`, and `docs/READINGS_AND_OPTICS.md` teach the Worldline/Optic-first API before mentioning `openWarpGraph()` or materialize surfaces. |
| Public API coverage | Every exported legacy graph-opening or materialize-named public method has a deprecation, diagnostic, or compatibility classification plus a replacement path in docs. |
| Regression coverage | New automated tests prove the new entrypoint can open a worldline, commit a patch, read through a worldline, read through an observer, and preserve legacy API compatibility. |

## 2. Scope Definition:

### In Scope

| Area | Built in this iteration |
|------|-------------------------|
| Public entrypoint | Add a new Worldline-first entrypoint, tentatively named `openWarpWorldline()`, that accepts the existing persistence and identity dependencies through a worldline-oriented dependency object. |
| Public handle | Add a runtime-backed handle, tentatively named `WarpWorldline`, that exposes writer identity, live worldline reads, historical seeking, observer creation, bounded optic access, and patch commitment without exposing full-state materialization. |
| Compatibility bridge | Implement the new entrypoint as a conservative wrapper over `openWarpGraph()` unless a cleaner internal seam already exists when the slice starts. |
| Deprecation policy | Mark `openWarpGraph()`, `WarpApp.open()`, `WarpCore.open()`, and public materialize-first methods as deprecated, compatibility, or diagnostic surfaces with explicit replacement guidance. |
| Documentation | Rewrite first-use docs, API reference front matter, Readings & Optics, migration guidance, and CLI wording so worldlines and optics are the default mental model. |
| Tests | Add unit, type-surface, docs-code, and smoke tests that lock the new API story and prove legacy behavior is not broken. |
| Release posture | Update `CHANGELOG.md`, `docs/BEARING.md`, and release notes so v18 has a user-facing value statement without overclaiming storage retirement or native Continuum witnesshood. |

### Out of Scope

| Area | Explicitly not built in this iteration |
|------|----------------------------------------|
| API removal | Do not remove `openWarpGraph()`, `WarpApp`, `WarpCore`, materialize methods, or CLI materialize commands in this cycle. |
| Storage migration | Do not retire `_content*`, raw property-map storage, graph-model migration internals, or compatibility storage in this cycle. |
| Native Continuum witnesshood | Do not claim that git-warp emits native Continuum witnesses. It remains a complete Continuum participant with translated git-warp evidence shaped for Continuum. |
| End-to-end graph streaming | Do not claim streamed reads and writes across the full graph lifecycle. The public handle should avoid eager materialization, but full streaming remains a v20 runway item. |
| Echo runtime authority | Do not import Echo scheduler semantics or give applications tick authority. git-warp stays a sibling Continuum participant, not an Echo substrate. |
| Breaking rename | Do not rename stored graph refs, Git history, package exports, or existing persisted data. |

### Proposed Public API Shape

The final naming can be adjusted during slice 115 if code evidence argues for a
better local convention, but this PRD assumes one decisive API rather than a
loose family of aliases.

```text
import { openWarpWorldline } from '@git-stunts/git-warp';

const worldline = await openWarpWorldline({
  persistence,
  worldlineName: 'events',
  writerId: 'agent-1',
  trust: { mode: 'enforce' },
});

await worldline.commit((patch) => {
  patch.addNode('user:alice');
  patch.setNodeProp('user:alice', 'displayName', 'Alice');
});

const live = worldline.live();
const props = await live.getNodeProps('user:alice');

const publicObserver = await live.observer('publicUsers', {
  match: 'user:*',
});

const reading = await publicObserver.reading();
```

Expected public-handle constraints:

- `worldline.live()` returns the current live `Worldline` read handle.
- `worldline.seek({ ceiling })` returns a historical `Worldline` read handle.
- `worldline.commit()` delegates to the patch capability without leaking graph
  folding or full-state materialization.
- `worldline.observer()` and `worldline.optic()` are reachable through the
  worldline read handle.
- The new handle does not expose `materialize()`, `materializeAt()`,
  `materializeCoordinate()`, `checkpoint`, `provenance`, or graph-wide flat
  aliases as first-class members.
- Advanced access to the old capability bag remains available only through
  legacy imports and documentation sections.

### Deprecation Classification Matrix

| Surface | v18 classification | Replacement |
|---------|--------------------|-------------|
| `openWarpGraph()` | Deprecated for first-use application code; still supported as the advanced compatibility composition root. | `openWarpWorldline()` for app read/write workflows. |
| `WarpApp.open()` | Legacy compatibility surface. | `openWarpWorldline()` or `openWarpGraph()` if advanced capability access is required. |
| `WarpCore.open()` | Legacy compatibility surface. | `openWarpWorldline()` or `openWarpGraph()` if advanced capability access is required. |
| `MaterializeCapability.materialize()` | Deprecated app-facing read path. | `worldline.live()`, `worldline.seek()`, `Worldline.observer()`, and observer readings. |
| `MaterializeCapability.materializeCoordinate()` | Deprecated app-facing coordinate read path. | `worldline.seek({ source })` or future coordinate-named worldline read handles. |
| `MaterializeCapability.materializeAt()` | Deprecated app-facing checkpoint read path. | Historical worldline seek plus observer/read APIs. |
| `graph.provenance.materializeSlice()` | Diagnostic/provenance surface; not first-use application API. | Provenance-specific docs must state diagnostic scope. |
| `graph.strands.materializeStrand()` | Diagnostic/speculative-lane inspection surface; not first-use application API. | Strand observer or future worldline-compatible strand read surface. |
| CLI `git warp materialize` | Diagnostic/operator command. | CLI query, observer, history, and future worldline-oriented commands for normal reads. |

## 3. Detailed User Stories:

| ID | User Story |
|----|------------|
| US-001 | As an application developer, I want to open a named worldline directly so that I can start with the product concept I actually read and write. |
| US-002 | As an application developer, I want to commit causal changes through the worldline handle so that I do not need to learn the graph capability bag before writing data. |
| US-003 | As an application developer, I want to read live state through a worldline so that my reads are framed as observer-relative revelation instead of raw materialized state. |
| US-004 | As an application developer, I want to seek to a historical worldline coordinate so that time-travel reads use the same public model as live reads. |
| US-005 | As an agent/tooling integrator, I want to create named observers from a worldline so that readings can carry explicit observer basis and projection information. |
| US-006 | As an agent/tooling integrator, I want bounded optic access from a worldline so that WARP Optic concepts are discoverable without importing graph internals. |
| US-007 | As a migration operator, I want existing `openWarpGraph()` code to keep working so that v18 adoption does not require an immediate rewrite. |
| US-008 | As a migration operator, I want clear deprecation guidance for graph-first and materialize-first calls so that I can migrate incrementally with low ambiguity. |
| US-009 | As a maintainer, I want export and type-surface tests for the new API so that package consumers receive the same public contract that docs describe. |
| US-010 | As a maintainer, I want materialize APIs classified consistently so that future removal or narrowing can proceed without accidental public API drift. |
| US-011 | As a release manager, I want README and API docs to lead with worldlines and optics so that v18 has a user-facing release claim beyond internal substrate progress. |
| US-012 | As a release manager, I want the release notes to state residual risks honestly so that users do not believe v18 retired all storage debt or implements full graph streaming. |

## 4. Acceptance Criteria (BDD Format):

### US-001: Open A Named Worldline Directly

| ID | Acceptance Criteria |
|----|---------------------|
| AC-001.1 | Given valid persistence, `worldlineName`, and `writerId`, when a user calls `openWarpWorldline()`, then it returns a frozen `WarpWorldline` handle with the same identity values. |
| AC-001.2 | Given missing or invalid identity input, when a user calls `openWarpWorldline()`, then the call fails through the existing typed error path and does not create refs or partial runtime state. |
| AC-001.3 | Given a code sample in README, when markdown code-sample lint runs, then the sample imports `openWarpWorldline()` and compiles against the package surface. |

### US-002: Commit Through The Worldline Handle

| ID | Acceptance Criteria |
|----|---------------------|
| AC-002.1 | Given an opened `WarpWorldline`, when the user commits a patch that adds a node, then the patch is admitted through the existing writer ref and can be read from the live worldline. |
| AC-002.2 | Given a patch callback throws before commit, when `commit()` returns, then no partial patch is persisted and the error is propagated through the existing result/error conventions. |
| AC-002.3 | Given a concurrent writer has advanced the same writer ref, when `commit()` attempts to update the ref, then the existing compare-and-swap conflict behavior is preserved. |

### US-003: Read Live State Through A Worldline

| ID | Acceptance Criteria |
|----|---------------------|
| AC-003.1 | Given a committed node, when the user calls `worldline.live().getNodeProps(nodeId)`, then the returned properties match the public graph query result. |
| AC-003.2 | Given no committed node, when the user calls `worldline.live().hasNode(nodeId)`, then the result is false and no materialize API is exposed on the new handle. |
| AC-003.3 | Given a live worldline read, when the implementation performs internal folding, then that detail is not represented as a public materialization step in the new API. |

### US-004: Seek To A Historical Worldline Coordinate

| ID | Acceptance Criteria |
|----|---------------------|
| AC-004.1 | Given multiple committed ticks, when the user seeks to an earlier ceiling, then reads from the returned worldline reflect the earlier coordinate. |
| AC-004.2 | Given a seek request beyond the current frontier, when the user reads, then the result is deterministic and follows existing ceiling/frontier semantics. |
| AC-004.3 | Given historical seek reads, when checkpoint policy is enabled, then the seek does not create new historical writer-head mutations. |

### US-005: Create Named Observers From A Worldline

| ID | Acceptance Criteria |
|----|---------------------|
| AC-005.1 | Given a live worldline and an aperture, when the user creates a named observer, then the observer reads only through the declared aperture. |
| AC-005.2 | Given an invalid aperture, when the user creates an observer, then validation fails before returning a read handle. |
| AC-005.3 | Given a historical worldline and the same aperture, when the user creates an observer, then the observer basis remains pinned to that historical source. |

### US-006: Discover Bounded Optic Access

| ID | Acceptance Criteria |
|----|---------------------|
| AC-006.1 | Given a worldline backed by an optic-capable source, when the user calls `optic()`, then a `WorldlineOptic` is returned without importing graph internals. |
| AC-006.2 | Given a source that does not support the current bounded optic implementation, when the user calls `optic()`, then the existing explicit unsupported-path error is preserved. |
| AC-006.3 | Given API docs for optics, when a user follows the sample, then the sample states current optic scope and does not imply native Echo tick authority. |

### US-007: Preserve `openWarpGraph()` Compatibility

| ID | Acceptance Criteria |
|----|---------------------|
| AC-007.1 | Given existing code using `openWarpGraph()`, when the test suite runs, then current graph capability behavior remains green. |
| AC-007.2 | Given package exports, when a consumer imports `openWarpGraph()`, then the symbol remains exported in v18. |
| AC-007.3 | Given API reference docs, when a user searches for `openWarpGraph()`, then the docs include deprecation language and a replacement path rather than removal language. |

### US-008: Provide Clear Migration Guidance

| ID | Acceptance Criteria |
|----|---------------------|
| AC-008.1 | Given a user with `openWarpGraph()` quickstart code, when they open the migration guide, then they see a before/after example using `openWarpWorldline()`. |
| AC-008.2 | Given a user with `materialize()` reads, when they open the migration guide, then they see the equivalent worldline or observer read pattern. |
| AC-008.3 | Given a user with advanced checkpoint or provenance needs, when they open the migration guide, then they see which APIs remain diagnostic or advanced compatibility surfaces. |

### US-009: Lock Export And Type Surface

| ID | Acceptance Criteria |
|----|---------------------|
| AC-009.1 | Given `npm run typecheck:surface`, when it runs, then the generated declaration surface exports the new entrypoint and handle types. |
| AC-009.2 | Given consumer type-check tests, when they import only documented public symbols, then the examples compile without private-path imports. |
| AC-009.3 | Given package export checks, when `npm run build` runs, then no unpublished implementation path is required by the new public docs. |

### US-010: Classify Materialize APIs Consistently

| ID | Acceptance Criteria |
|----|---------------------|
| AC-010.1 | Given a materialize-named public method, when the docs inventory runs, then the method has a classification: deprecated app API, diagnostic, compatibility, or internal-only. |
| AC-010.2 | Given `MaterializeCapability`, when TSDoc is generated or inspected, then app-facing methods include `@deprecated` guidance to worldline/observer reads. |
| AC-010.3 | Given CLI materialize docs, when a user reads the command reference, then the command is framed as operator diagnostics rather than normal application reads. |

### US-011: Lead First-Use Docs With Worldlines And Optics

| ID | Acceptance Criteria |
|----|---------------------|
| AC-011.1 | Given the README first code block, when a new user reads it, then it opens a worldline and reads through a worldline or observer. |
| AC-011.2 | Given `docs/READINGS_AND_OPTICS.md`, when it introduces the pipeline, then it starts from `openWarpWorldline()` rather than `openWarpGraph()`. |
| AC-011.3 | Given `docs/API_REFERENCE.md`, when it lists entrypoints, then `openWarpWorldline()` appears before legacy graph-opening APIs. |

### US-012: Keep Release Claims Honest

| ID | Acceptance Criteria |
|----|---------------------|
| AC-012.1 | Given `CHANGELOG.md`, when users read the v18 entry, then it describes the new public API pivot without claiming storage retirement. |
| AC-012.2 | Given `docs/BEARING.md`, when future agents read the live state, then it distinguishes public API deprecation work from storage retirement, native Continuum witnesshood, and streaming. |
| AC-012.3 | Given release notes, when a maintainer reviews residual risks, then materialize compatibility and storage debt are named explicitly. |

## 5. Detailed Test Plan:

### Test Scenarios

| Scenario ID | Type | Slice | Preconditions | Steps | Assertions | Automation |
|-------------|------|-------|---------------|-------|------------|------------|
| TS-001 | Unit | 117 | In-memory or test persistence is available. | Open a `WarpWorldline` with valid identity. | Handle is frozen, identity is preserved, and `materialize` is not a member. | New unit test. |
| TS-002 | Unit | 118 | `WarpWorldline` is open. | Commit a node through `worldline.commit()`, then read `live().hasNode()`. | Node is present and writer ref advances once. | New unit test. |
| TS-003 | Unit | 118 | `WarpWorldline` is open. | Throw from patch callback before commit. | No partial commit is visible through live reads. | New unit test. |
| TS-004 | Unit | 119 | Multiple committed ticks exist. | Seek to an earlier ceiling and read node props. | Historical read excludes later updates. | New unit test. |
| TS-005 | Unit | 119 | Live worldline contains nodes matching an aperture. | Create named observer and read. | Observer returns only aperture-matching state. | New or extended observer test. |
| TS-006 | Unit | 119 | Optic-capable worldline source exists. | Call `live().optic()`. | `WorldlineOptic` is returned or explicit unsupported error is thrown for unsupported sources. | New optic capability test. |
| TS-007 | Compatibility | 120 | Existing `openWarpGraph()` tests exist. | Run relevant graph public API tests. | No behavior regression. | Existing suite plus targeted compatibility test. |
| TS-008 | Type surface | 122 | Build output exists. | Run consumer type-check import tests. | `openWarpWorldline`, `WarpWorldline`, and documented public types are exported. | `npm run typecheck:surface` and consumer test. |
| TS-009 | Docs code | 123-125 | README/API samples have been rewritten. | Run markdown code-sample lint. | New samples compile; no first-use sample uses graph-first API. | `npm run lint:md:code`. |
| TS-010 | Static docs audit | 125 | Docs have migration tables. | Search first-use sections for graph/materialize-first language. | Legacy mentions are confined to migration, compatibility, or diagnostic sections. | Scripted or manual `rg` audit. |
| TS-011 | Negative input | 117 | Invalid identity inputs are available. | Call new entrypoint with blank name or writer. | Existing validation error path is preserved; no partial refs are written. | New unit test. |
| TS-012 | Broken dependency | 117 | Persistence stub fails on open or write. | Open or commit through new handle. | Error propagates without swallowing cause or leaving committed partial state. | New unit test using failing port. |
| TS-013 | Concurrency | 118 | Two handles share persistence and writer identity. | Race two commits that target same writer ref. | Existing CAS conflict behavior is preserved. | Existing CAS test pattern extended. |
| TS-014 | Performance | 129 | Fixture with many patches exists. | Open handle and perform a narrow observer read. | No public full-graph materialize call is required; runtime budget is recorded. | Targeted performance guard or instrumentation test. |
| TS-015 | Security/boundary | 129 | New public handle is inspected. | Attempt to access graph-only capability members from public handle. | Checkpoint, provenance, and materialize capabilities are not exposed. | Unit and type-surface tests. |
| TS-016 | Accessibility/docs | 123-125 | Docs and CLI wording are updated. | Review headings, examples, and CLI command descriptions. | Docs have linear headings, code blocks have languages, CLI docs do not rely on color-only meaning. | Markdown lint plus manual checklist. |

### Happy Path Testing

1. Create test persistence and open a worldline:

   ```text
   const worldline = await openWarpWorldline({
     persistence,
     worldlineName: 'events',
     writerId: 'agent-1',
   });
   ```

2. Assert the handle is frozen and identity values match input.
3. Commit a patch through `worldline.commit()`:

   ```text
   await worldline.commit((patch) => {
     patch.addNode('user:alice');
     patch.setNodeProp('user:alice', 'displayName', 'Alice');
   });
   ```

4. Read through the live worldline:

   ```text
   const live = worldline.live();
   const exists = await live.hasNode('user:alice');
   const props = await live.getNodeProps('user:alice');
   ```

5. Assert `exists` is true and `props.get('displayName')` equals the expected
   value representation used by existing query tests.
6. Create an observer from `live` and read through the observer.
7. Assert the observer output matches the same aperture when reached through the
   existing graph query surface.
8. Seek to a historical ceiling before a later update.
9. Assert the historical read excludes later data while live read includes it.
10. Run existing `openWarpGraph()` public tests to prove backward compatibility.

### Negative/Edge Case Testing

| Case | Required behavior |
|------|-------------------|
| Blank `worldlineName` | Fail with typed validation; do not create graph refs, writer refs, or checkpoints. |
| Blank `writerId` | Fail with typed validation; do not create writer refs. |
| Persistence open failure | Propagate the error through the same error semantics as `openWarpGraph()`; do not wrap in raw host errors from domain code. |
| Patch callback throws | Abort the patch before commit; no partial node, edge, property, or content update is visible. |
| Commit CAS conflict | Preserve existing writer isolation and compare-and-swap behavior. |
| Observer aperture is invalid | Reject observer creation before returning a readable observer. |
| Unsupported optic source | Return the existing explicit unsupported-path error; do not fake an optic. |
| Legacy code path | `openWarpGraph()` and legacy graph query tests continue to pass. |
| Diagnostic materialize use | Existing materialize diagnostics still work, but new first-use docs do not point users there. |
| Huge patch history | New public reads must not require a public full-state materialize call; internal folding remains allowed and must be documented honestly. |
| Broken checkpoint/index dependency | New handle must degrade or fail according to existing runtime policy, without exposing partial state. |
| Concurrent readers and writer | Readers see deterministic worldline state according to the selected source; writer ref updates remain isolated. |

### Non-Functional Testing

| Category | Requirement | Test approach |
|----------|-------------|---------------|
| Performance | Opening a `WarpWorldline` should add negligible overhead over `openWarpGraph()` wrapping. | Benchmark or timing guard comparing new wrapper open against current graph open on a small fixture. |
| Performance | Narrow observer reads should not force users to call public materialize APIs. | Instrument new public path to assert it does not invoke deprecated public materialize methods. |
| Load/concurrency | Multiple readers against the same worldline and multiple writers against independent refs must preserve existing deterministic merge behavior. | Extend no-coordination and CAS regression tests using the new public handle. |
| Security/boundary | New public handle must not expose diagnostic or substrate capabilities by accident. | Runtime member inspection and declaration-surface tests. |
| Security/boundary | Domain code must not gain ambient filesystem, environment, wall-clock, or network access while adding the wrapper. | `npm run lint:sludge`, `npm run lint:semgrep`, and manual anti-sludge checklist. |
| Accessibility | Documentation and CLI help must remain usable as linear text. | Markdown heading review, fenced-language lint, and manual CLI docs review for color-independent meaning. |
| Compatibility | Existing v17/v18 graph-first applications must keep compiling and running. | Existing unit suite plus consumer type-check tests that import legacy symbols. |
| Observability | Deprecation guidance must be discoverable without runtime warning noise. | API docs, TSDoc, changelog, and migration guide review. Runtime warnings are out of scope unless controlled by an explicit logger/config. |

## 6. 20-Slice Delivery Plan

| Slice | Title | Outcome | Primary proof |
|-------|-------|---------|---------------|
| 113 | PRD and BEARING pivot | This PRD exists and `BEARING` names the Worldline/Optic-first goal. | Markdown lint and diff review. |
| 114 | Public surface inventory | Inventory every graph-opening, materialize-named, worldline, observer, and optic public surface. | Inventory doc plus `rg` evidence. |
| 115 | API naming and dependency contract | Decide final entrypoint and dependency names without implementation drift. | Design doc with accepted/rejected names. |
| 116 | Runtime-backed public types | Add explicit public handle/dependency types using repo type doctrine. | Typecheck and anti-sludge checks. |
| 117 | Entrypoint wrapper | Implement `openWarpWorldline()` over existing runtime. | Unit tests for open/frozen/no materialize member. |
| 118 | Commit path | Add worldline-handle commit API over patch capability. | Red/green commit and abort tests. |
| 119 | Read/observer/optic path | Prove live, historical, observer, and bounded optic reads from the new handle. | Unit tests for live, seek, observer, optic. |
| 120 | Legacy graph API deprecation | Mark graph-opening APIs with precise TSDoc and docs guidance. | Type surface and docs audit. |
| 121 | Materialize API deprecation/classification | Classify all materialize-named public methods. | Deprecation matrix and targeted docs. |
| 122 | Public surface tests | Lock exports, declaration surface, and consumer imports. | `build`, `typecheck:surface`, consumer typecheck. |
| 123 | README rewrite | First-use docs use `openWarpWorldline()`. | Markdown code-sample lint. |
| 124 | Readings & Optics rewrite | Read model starts from worldline/optic language. | Docs audit against graph-first phrasing. |
| 125 | API reference rewrite | API reference puts new entrypoint first and legacy paths later. | Docs lint and `rg` placement review. |
| 126 | CLI diagnostic wording | CLI materialize docs are diagnostic/operator scoped. | API reference CLI section review. |
| 127 | Error and runtime docs sweep | User-facing wording avoids graph/materialize-first framing where inappropriate. | `rg` audit plus focused tests if messages changed. |
| 128 | Migration guide | Add before/after migration guide for graph/materialize users. | Docs lint and code-sample lint. |
| 129 | Non-functional guards | Add boundary/performance/concurrency guard tests. | Targeted tests and anti-sludge checks. |
| 130 | Package surface audit | Verify package exports, declarations, and docs examples agree. | `npm run build`, surface check, docs code check. |
| 131 | Changelog and release story | Update changelog/release notes/BEARING with user-facing v18 claim. | Docs lint and release posture review. |
| 132 | Drift check and go/no-go | Replan with evidence, decide whether to PR or continue. | Full local verification summary and updated BEARING. |

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| New API becomes a thin alias without product value | Users still perceive v18 as internal churn. | Make docs, examples, and tests prove a worldline-first workflow end to end. |
| Deprecation reads as removal | Users may fear v18 is breaking. | Use "deprecated for first-use application code" and "compatibility supported" language consistently. |
| Materialize internals are still required | Overclaiming would damage trust. | State that internal folding may still occur; only public materialize-first APIs are deprecated. |
| New handle leaks graph capabilities | The product story collapses back into graph-first API. | Runtime member tests and declaration-surface tests must prove no accidental leak. |
| Optic support is narrower than user expectation | Docs could overpromise Echo/WARP parity. | Document current bounded optic scope and explicitly exclude Echo tick authority and native Continuum witnesshood. |

## Open Decisions For Slice 115

| Decision | Default in this PRD | Alternatives |
|----------|---------------------|--------------|
| Entrypoint name | `openWarpWorldline()` | `openWorldline()`, `openWarp()`, `openWarpSession()` |
| Handle name | `WarpWorldline` | `WarpWorldlineHandle`, `WorldlineWorkspace`, `WarpWorkspace` |
| Commit API shape | `worldline.commit((patch) => { ... })` | `worldline.patches.createPatch()`, `worldline.writer.commit()`, explicit command objects |
| Historical coordinate option | `seek({ ceiling })` and current `WorldlineOptions` | dedicated coordinate object with stricter runtime class |
| Runtime warnings | No runtime warning by default | logger-controlled warnings for deprecated APIs |
