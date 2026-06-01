---
cycle: 0265
task_id: API_optics-public-api-closeout
status: Blocked
github_issue_url: https://github.com/git-stunts/git-warp/issues/547
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-26
release_home: v18.0.0
backlog:
  - docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v18.0.0/API_optics-public-api-closeout.md
  - docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v18.0.0/API_no-full-materialization-first-use-optics.md
issues:
  - https://github.com/git-stunts/git-warp/issues/547
  - https://github.com/git-stunts/git-warp/issues/546
  - https://github.com/git-stunts/git-warp/issues/549
---

# v18 Optics Public API Closeout

## Release Honesty Update

The coordinate Optics implementation slices below are branch-local evidence,
not release-complete proof. The current public basis setup path calls
`graph.materialize()` before `graph.createCheckpoint()`, so v18 is blocked by
`API_no-full-materialization-first-use-optics`.

Keep the two v18 gates separate and blocking:

- V18 honesty gate: documented first-use application paths avoid full graph
  materialization.
- Large-graph product gate: memory pools, streaming basis construction,
  sharded fact resolvers, cursorized reads and sync, bounded content lookup,
  capability reporting, operator tooling, and conformance over graphs larger
  than the configured pool. This is tracked by
  `PERF_bounded-memory-large-graph-product-gate`.

## Pull

Optics are part of the public-facing v18 value proposition. The current
Worldline-first branch exposes `events.optic()`, but the first-use product
story is not complete enough for release:

- the public path can fail with `E_OPTIC_NO_BOUNDED_BASIS` unless a
  checkpoint-tail indexed basis exists;
- the docs show a clean `events.optic().node(...).prop(...).read()` example
  without teaching how the required basis is created or verified;
- the package surface does not yet make an explicit decision about whether
  coordinate, optic handle, and read-result nouns are exported public types or
  intentionally opaque chain-return values;
- consumer-facing tests prove the chain exists, but they do not prove a full
  public success path from `openWarpWorldline(...)`;
- separate awaited optic reads can observe different causal positions unless a
  public coordinate pins the observation; and
- requiring a new user to recover through the deprecated graph-first surface
  would undermine the v18 Worldline-first product story.

That is an honest foundation, not a release-complete public API.

## Method Contract

| Field | Value |
| --- | --- |
| Sponsor human | James |
| Sponsor agent | Codex |
| Hill | Before `v18.0.0` is tagged or published, a first-use application developer can prepare bounded optic evidence, capture a stable Worldline coordinate, and run coherent node and property optic reads without whole-graph materialization. |
| Agent playback question | Can the repo-visible tests prove the public Worldline-first coordinate optic path succeeds, fails explicitly, stays coherent when the live worldline advances, and never falls back to materialization? |
| Human playback question | Can a new user read the docs, create or verify the required basis, capture a coordinate without opening legacy graph APIs, and understand how to recover when an optic read fails? |
| Accessibility posture | This is API and documentation work. The accessible path is clear headings, copy-pasteable examples, named errors, and linear recovery steps that do not rely on visual context. |
| Localization posture | Public docs must avoid idioms where precise operational wording is needed; code identifiers remain untranslated and explanatory prose should not depend on English wordplay. |
| Agent inspectability posture | Each slice must leave inspectable evidence in tests, docs, or package exports so later agents can verify the release gate without reconstructing intent from chat. |
| Non-goals | Native Continuum witnesshood, Echo scheduler parity, full observer-plan parity, graph streaming reads and writes, broad graph query replacement, and legacy content/property storage retirement. |

## 1. Feature Overview & Objectives:

### Feature Name

`v18 Optics Public API Closeout`

### One-Sentence Description

Make `openWarpWorldline(...).coordinate().optic()` release-complete by adding a
Worldline-first bounded-basis setup path, proving coherent public node and
property optic reads, documenting recovery, and locking the consumer TypeScript
surface.

### Problem Statement

The v18 branch currently presents Optics as a public capability, but the
first-use path is incomplete. A user can discover `events.optic()` from the
README, migration guide, or API reference, then immediately hit
`E_OPTIC_NO_BOUNDED_BASIS` without a Worldline-first way to create or verify
the required checkpoint-tail indexed basis.

There is also a semantic gap: two separate awaited live optic reads are not
automatically a coherent read set. If the worldline advances between a node
read and a property read, the two answers may describe different causal
positions. v18 must make the public coherence boundary explicit by naming a
`coordinate`.

A coordinate is a stable causal position in a worldline. It is not merely a
scalar Lamport tick; in a multi-writer graph it must represent the relevant
writer frontier, optional ceiling, checkpoint-tail basis, and read evidence
needed for deterministic optic answers.

### Target User/Audience

| Persona | Need | Release Risk If Unserved |
| --- | --- | --- |
| Application developer | Start from `openWarpWorldline(...)`, commit data, prepare optic evidence, capture a coordinate, and read coherent node/property facts. | v18 appears to expose an API that either fails or returns incoherent multi-read results in normal workflows. |
| Tooling author | Use coordinate identity, optic read identities, and recovery errors to build inspection, replay, or migration tools. | Tools must import internals or guess whether two answers came from the same causal position. |
| Maintainer or release operator | Verify that v18's public claims match tests, docs, exports, and release notes. | Release gates drift and v18 ships with an overstated value proposition. |
| Future Continuum integrator | Treat coordinates and Optics as public read shapes in the broader witnessed-history protocol story. | v18 creates API debt that must be corrected before v19/v20 Continuum work. |

### Measurable Success Metrics (KPIs)

| KPI | Target | Evidence |
| --- | --- | --- |
| Public coordinate optic coverage | At least one public `prepareOpticBasis()`, `coordinate()`, and `coordinate.optic().node(id).read()` test and one public coordinate property optic read test pass against real checkpoint-tail indexed evidence. | Conformance or unit tests named in the release witness. |
| Coordinate coherence under advancement | A race test deletes or changes the target between two optic reads and proves reads from the original coordinate stay coherent while a later coordinate observes the new state. | Public-path concurrency or interleaving test. |
| No whole-graph fallback | Coordinate optic reads return checkpoint-tail read identity evidence, while the lower-level checkpoint-tail optic fixtures continue to trap `_materializeGraph()` fallback. | Public read identity assertions plus existing materialization fallback traps. |

## 2. Scope Definition:

### In Scope

- A Worldline-first public setup path for bounded optic evidence.
- A Worldline-first public coordinate capture path.
- The default target APIs are `await worldline.prepareOpticBasis()` and
  `await worldline.coordinate()`.
- Slice 133 may rename either method, but only if it preserves the same product
  behavior and updates this design, tests, docs, and type checks before code
  work continues.
- Public success-path tests for node optic reads through
  `openWarpWorldline(...).coordinate().optic()`.
- Public success-path tests for node-property optic reads through
  `openWarpWorldline(...).coordinate().optic()`.
- A coordinate coherence test proving two reads from the same coordinate are
  stable when the live worldline advances between reads.
- Proof that public coordinate optic reads return checkpoint-tail read identity
  evidence instead of materialized snapshot results.
- Public recovery docs for `E_OPTIC_NO_BOUNDED_BASIS`,
  `E_OPTIC_TAIL_BUDGET_EXCEEDED`, and `E_OPTIC_READ_IDENTITY`.
- Package-surface decision for the coordinate noun, `WorldlineOptic`,
  `NodeOpticReadResult`, `NodePropertyOpticReadResult`, and any new basis
  receipt type.
- Consumer type tests that compile documented examples without internal path
  imports.
- API reference, readings guide, migration guide, README, changelog, BEARING,
  and backlog updates for this release blocker.
- Drift check after slice 144 and final go/no-go after slice 152.

### Out of Scope

- Native Continuum contract implementation.
- Echo or Wesley generated-code compatibility beyond keeping coordinates and
  Optics honest as a public v18 capability.
- General WARP Optic parity with every generated `ObserverPlan`,
  `ObservationRequest`, or `ReadingEnvelope` shape.
- Edge, neighbor, attachment, recursive, or arbitrary graph optics.
- End-to-end graph streaming reads and writes.
- Full retirement of content/property storage compatibility paths.
- Removing the advanced graph API.
- Publishing `v18.0.0`; release operation remains a separate gate after this
  work lands.

### Product Contract For This Iteration

The public story must read as a Worldline-first workflow:

```ts
const events = await openWarpWorldline({
  persistence,
  worldlineName: 'events',
  writerId: 'app',
});

await events.commit((patch) => {
  patch.addNode('event-1');
  patch.setProperty('event-1', 'status', 'open');
});

await events.prepareOpticBasis();

const coordinate = await events.coordinate();

const node = await coordinate.optic().node('event-1').read();
const status = await coordinate.optic().node('event-1').prop('status').read();
```

The setup and coordinate methods may be implemented on `WarpWorldline` or an
equivalent Worldline-first namespace if slice 133 chooses a better shape. The
product rule is fixed: coherent multi-read workflows go through a pinned
coordinate, and first-use application developers must not need to open
`openWarpGraph(...)` just to make the documented optic chain usable.

The convenience form `worldline.optic()` may remain for one-off live reads if
the implementation already supports it, but v18 documentation must lead with
the coordinate form. A naked live optic read is not the coherence boundary.

### Coordinate Semantics

| Concept | Meaning |
| --- | --- |
| `Worldline` | The evolving causal history stream. |
| `Coordinate` | A stable causal position in the worldline. It pins the frontier, optional ceiling, basis, and read evidence needed for coherent optic reads. |
| `Optic` | A bounded read mechanism over a coordinate. |

If the worldline advances after a coordinate is captured, reads through that
coordinate must continue to answer from the captured position. A later
coordinate may observe the later state.

## 3. Detailed User Stories:

| ID | User Story |
| --- | --- |
| US-001 | As an application developer, I want to prepare bounded optic evidence from my `WarpWorldline` so that I do not need to open deprecated graph-first APIs before the first optic read. |
| US-002 | As an application developer, I want to capture a `coordinate` from my `WarpWorldline` so that multiple optic reads describe the same causal position. |
| US-003 | As an application developer, I want to run `coordinate.optic().node(id).read()` successfully so that Optics are not merely an error surface. |
| US-004 | As an application developer, I want to run `coordinate.optic().node(id).prop(key).read()` successfully so that I can read a bounded property value without materializing the graph. |
| US-005 | As an application developer, I want reads from an older coordinate to stay stable when the live worldline advances so that interleaved writes do not corrupt my read set. |
| US-006 | As an application developer, I want missing nodes and missing properties to have documented result semantics so that I do not confuse absence with transport or parser failure. |
| US-007 | As a tooling author, I want successful optic reads to expose stable read identity evidence so that tools can explain which coordinate, checkpoint, and tail evidence backed the answer. |
| US-008 | As a tooling author, I want optic failures to explain missing bounded evidence so that I can offer the right repair action. |
| US-009 | As a TypeScript consumer, I want the documented coordinate optic chain and result handling to type-check from package exports so that I do not import from `src/domain/**`. |
| US-010 | As a maintainer, I want public export decisions for coordinate and optic nouns to be explicit so that the package surface does not accidentally leak internals. |
| US-011 | As a release operator, I want release docs to block v18 until coordinate-backed Optics closeout is complete so that the release does not overclaim product value. |
| US-012 | As a future Continuum integrator, I want v18 coordinate and Optics docs to name bounded, checkpoint-tail scope precisely so that later Continuum witnesshood work can extend the model without breaking this release. |

## 4. Acceptance Criteria (BDD Format):

| Story | Given | When | Then |
| --- | --- | --- | --- |
| US-001 | A user has a `WarpWorldline` opened with `openWarpWorldline(...)` and has committed at least one node. | The user calls `prepareOpticBasis()` or the final slice-133-approved equivalent. | The method creates or verifies checkpoint-tail indexed evidence and returns a documented receipt without requiring `openWarpGraph(...)`. |
| US-001 | A user calls the basis setup method twice without intervening commits. | The second call runs. | The method is idempotent from the user's perspective and returns a receipt rather than corrupting or duplicating evidence. |
| US-002 | A user has prepared optic basis evidence. | The user calls `coordinate()` or the final slice-133-approved equivalent. | The method returns a coordinate object that can create an optic and exposes documented coordinate identity. |
| US-002 | A user captures two coordinates before and after a write. | The user compares their identities. | The identities distinguish the two causal positions without reducing the worldline to a scalar tick. |
| US-003 | A coordinate has checkpoint-tail indexed evidence for node `event-1`. | The user calls `coordinate.optic().node('event-1').read()`. | The read returns a live-node result with `nodeId === 'event-1'`, `alive === true`, and a valid read identity. |
| US-003 | The coordinate node optic read succeeds. | The user inspects the result identity. | The result carries checkpoint-tail read identity evidence that names the coordinate checkpoint. |
| US-004 | A coordinate has checkpoint-tail indexed evidence and a tail property update for `event-1.status`. | The user calls `coordinate.optic().node('event-1').prop('status').read()`. | The read returns an existing property result with the expected value and read identity. |
| US-004 | A property update lands after the prepared basis and before coordinate capture. | The coordinate property optic read succeeds. | The result includes tail witness evidence for the post-basis update. |
| US-005 | A coordinate is captured while `event-1` is live with `status === 'open'`. | Another writer deletes `event-1` between the coordinate node read and coordinate property read. | Both reads from the original coordinate remain coherent with the captured position. |
| US-005 | A later coordinate is captured after the delete. | The user reads `event-1` from the later coordinate. | The later coordinate observes the delete according to documented absence semantics. |
| US-006 | A coordinate has bounded evidence but no live node for `missing-node`. | The user reads `coordinate.optic().node('missing-node').read()`. | The result reports the node as not alive using documented fields, without throwing an internal error. |
| US-006 | A coordinate has a live node with no property for `missing-key`. | The user reads `coordinate.optic().node(id).prop('missing-key').read()`. | The result reports `exists === false` and the documented absent-value shape. |
| US-007 | A node or property optic read succeeds. | The user inspects `readIdentity`. | The identity names the checkpoint-tail basis and tail evidence needed for replay or diagnosis; the coordinate object carries the captured frontier. |
| US-008 | No bounded optic basis exists. | The user calls the documented coordinate optic read path. | The failure is `E_OPTIC_NO_BOUNDED_BASIS` and docs instruct the user to prepare or repair the basis through the Worldline-first setup path. |
| US-008 | The tail exceeds the configured optic budget. | The user calls a node or property optic read. | The failure is `E_OPTIC_TAIL_BUDGET_EXCEEDED` and docs explain checkpoint refresh or budget retry behavior. |
| US-008 | Read identity evidence is unavailable or malformed. | The user calls a node or property optic read. | The failure is `E_OPTIC_READ_IDENTITY` and docs classify it as evidence integrity failure, not ordinary absence. |
| US-009 | A consumer imports only from `@git-stunts/git-warp`. | The consumer compiles the documented setup, coordinate capture, and optic read examples. | TypeScript succeeds with no internal path imports. |
| US-009 | A consumer tries to import coordinate or optic internals from `src/domain/**`. | The type-check negative case runs. | The project rejects or avoids documenting that path. |
| US-010 | Maintainers inspect `index.ts`, package exports, and consumer tests. | The release branch is reviewed. | Every coordinate, optic, and result noun is either root-exported as public API or intentionally kept opaque and documented that way. |
| US-011 | Maintainers inspect `docs/BEARING.md`, release notes, and backlog. | The coordinate Optics closeout checklist is incomplete. | `v18.0.0` remains blocked. |
| US-012 | A reader compares v18 docs with future Continuum planning. | They read the coordinate Optics scope statement. | The docs state that v18 Optics are bounded checkpoint-tail reads over pinned coordinates, not full Continuum witnesshood or general graph streaming. |

## 5. Detailed Test Plan:

### Test Scenarios

| ID | Layer | Story | Scenario | Fixture/Data | Expected Result |
| --- | --- | --- | --- | --- | --- |
| TS-001 | Unit | US-001 | Basis setup can be invoked from `WarpWorldline`. | Temporary graph with one committed node. | Receipt returned; no `openWarpGraph(...)` required in the user-facing test. |
| TS-002 | Unit | US-001 | Basis setup is repeatable. | Same graph, no intervening commits. | Second call returns a receipt and does not corrupt evidence. |
| TS-003 | Unit | US-002 | Coordinate capture can be invoked from `WarpWorldline`. | Prepared public worldline fixture. | Coordinate object returned with documented identity. |
| TS-004 | Unit | US-002 | Coordinate identity distinguishes causal positions. | Capture before and after a write. | Identities differ without relying on scalar tick only. |
| TS-005 | Conformance | US-003 | Public coordinate node optic read succeeds. | Existing v17 checkpoint-tail optic fixture adapted to public API. | `alive === true`, expected `nodeId`, read identity present. |
| TS-006 | Conformance | US-003 | Coordinate node read returns bounded identity. | Public fixture plus coordinate checkpoint. | Result identity names the coordinate checkpoint. |
| TS-007 | Conformance | US-004 | Public coordinate property optic read succeeds. | Fixture with checkpoint value and live tail property value. | `exists === true`, expected value, read identity present. |
| TS-008 | Conformance | US-004 | Coordinate property read includes tail evidence. | Basis prepared before a later property update. | Result value reflects the tail update and identity includes one tail witness. |
| TS-009 | Conformance | US-005 | Coordinate reads stay coherent when the live worldline advances. | Coordinate captured before another writer deletes target node. | Reads from original coordinate remain at original state; later coordinate sees delete. |
| TS-010 | Unit | US-006 | Missing node result semantics. | Fixture constant `MISSING_NODE_ID`. | Documented not-live result; no internal error. |
| TS-011 | Unit | US-006 | Missing property result semantics. | Live node without requested key. | `exists === false`, documented absent value. |
| TS-012 | Unit | US-007 | Read identity evidence includes basis and tail relation. | Known checkpoint-tail fixture. | Read identity includes checkpoint basis and tail evidence fields validated by result classes. |
| TS-013 | Unit | US-008 | Missing basis failure. | Worldline with no checkpoint-tail indexed basis. | `E_OPTIC_NO_BOUNDED_BASIS` with recovery context. |
| TS-014 | Unit | US-008 | Unsupported historical selector failure. | Unsupported selector passed to coordinate optic path. | Fail closed with `E_OPTIC_NO_BOUNDED_BASIS`. |
| TS-015 | Unit | US-008 | Tail budget exceeded failure. | Fixture with budget lower than required tail length. | `E_OPTIC_TAIL_BUDGET_EXCEEDED` and documented recovery context. |
| TS-016 | Unit | US-008 | Read identity failure remains explicit. | Malformed or unavailable identity fixture. | `E_OPTIC_READ_IDENTITY` and no absence-shaped result. |
| TS-017 | Type check | US-009 | Public import example compiles. | `test/type-check/consumer.ts`. | No internal imports needed for documented setup, coordinate capture, and optic reads. |
| TS-018 | Unit | US-010 | Root export audit. | `test/unit/index.exports.test.ts`. | Exports match the chosen public/opaque coordinate and optic surface. |
| TS-019 | Docs guard | US-011, US-012 | Docs name coordinate Optics blocker and bounded checkpoint-tail scope. | `docs/BEARING.md`, API reference, readings guide, migration guide, release README. | v18 remains blocked until closeout; no claim of full Continuum or graph streaming support. |
| TS-020 | Release gate | US-011 | Preflight after all slices. | Local repo state. | Lint, typecheck, tests, docs guard, and coverage-relevant suites pass. |

### Happy Path Testing

1. Create a temporary persistence root using the same adapter family documented
   for first-use application code.
2. Open a `WarpWorldline` with `openWarpWorldline({ persistence,
   worldlineName, writerId })`.
3. Commit a node and property through `worldline.commit(...)`.
4. Call the Worldline-first basis setup method.
5. Assert that the returned basis receipt names enough public evidence for
   docs and diagnosis.
6. Capture a coordinate with `worldline.coordinate()` or the approved
   equivalent.
7. Assert that the coordinate identity names a stable causal position rather
   than a scalar tick alone.
8. Read `coordinate.optic().node(nodeId).read()`.
9. Assert `nodeId`, `alive`, and checkpoint-tail read identity evidence.
10. Commit a post-basis property update.
11. Capture a later coordinate and read
    `coordinate.optic().node(nodeId).prop(key).read()`.
12. Assert `nodeId`, `key`, `exists`, `value`, read identity, and tail witness
    evidence.
13. Reopen the same `worldlineName` with `openWarpWorldline(...)`.
14. Capture a new coordinate and repeat the node and property reads to prove
    setup survives process-local object lifetime.

### Negative/Edge Case Testing

| Case | Setup | Expected Behavior |
| --- | --- | --- |
| Missing basis | Commit data, skip basis setup, capture coordinate or call optic read. | Fail with `E_OPTIC_NO_BOUNDED_BASIS`; docs point to Worldline-first setup. |
| Empty worldline name | Call `openWarpWorldline(...)` with blank identity. | Existing `E_WARP_WORLDLINE_IDENTITY` behavior remains covered. |
| Empty writer id | Call `openWarpWorldline(...)` with blank writer id. | Existing `E_WARP_WORLDLINE_IDENTITY` behavior remains covered. |
| Empty node id | Call `coordinate.optic().node('')`. | Either reject with a named Warp error or document why existing behavior is valid; no raw internal error. |
| Empty property key | Call `coordinate.optic().node(id).prop('')`. | Either reject with a named Warp error or document why existing behavior is valid; no raw internal error. |
| Missing node | Read a node not present in bounded evidence. | Return documented not-live result. |
| Missing property | Read a property absent from a live node. | Return `exists === false` with documented absent value. |
| Interleaved node delete | Capture coordinate, read node, delete node through another writer, read property from original coordinate. | Original coordinate remains coherent; later coordinate observes delete. |
| Interleaved property update | Capture coordinate, read property, update property through another writer, read property again from original coordinate. | Original coordinate returns the original value; later coordinate observes update. |
| Unsupported selector | Seek or construct an unsupported non-live coordinate optic selector. | Fail closed with `E_OPTIC_NO_BOUNDED_BASIS`; no silent retargeting to live. |
| Tail budget exceeded | Force budget below the fixture tail length. | Fail with `E_OPTIC_TAIL_BUDGET_EXCEEDED`; recovery docs name checkpoint refresh or budget retry. |
| Broken persistence | Configure adapter to fail while preparing basis, capturing coordinate, or reading evidence. | Surface an expected Warp error or existing adapter error without converting it into absence. |
| Concurrent writers | Create basis, capture coordinate, append a tail patch from another writer, read property. | Original coordinate stays stable; later coordinate includes bounded tail evidence or fails explicitly if outside budget. |
| Concurrent basis setup | Two callers prepare basis for the same worldline concurrently. | Compare-and-swap semantics or existing checkpoint behavior prevents corruption; test documents observed outcome. |
| Corrupt checkpoint index | Remove or corrupt index shard in fixture. | Fail with `E_OPTIC_NO_BOUNDED_BASIS` or `E_OPTIC_READ_IDENTITY` according to existing optic error contract. |
| Timeout or long tail | Simulate long tail with low budget. | Deterministic budget failure, not wall-clock-dependent timeout behavior in domain code. |

### Non-Functional Testing

| Area | Requirement | Evidence |
| --- | --- | --- |
| Performance | Public coordinate node and property optic reads must avoid full materialization. | Materialization trap tests. |
| Load | Tail scanning must remain bounded by explicit budget semantics and must not depend on ambient time. | Tail-budget tests and no new domain wall-clock usage. |
| Determinism | Same coordinate evidence must produce the same optic result across repeated reads and reopen. | Coordinate coherence and reopen/read conformance tests. |
| Coherence | Multiple reads from one coordinate must describe the same causal position even if the live worldline advances between reads. | Interleaved writer tests. |
| Security | Coordinate setup and optic reads must not bypass observer/aperture documentation; docs must state current authority model honestly. | API reference and readings guide review. |
| Type safety | No `any`, `unknown`, cast bridges, or internal imports in the public coordinate optic implementation or tests. | Lint, typecheck, anti-sludge review. |
| Accessibility | Docs must use structured headings, named errors, and copy-pasteable code blocks with language tags. | Markdown lint plus manual docs review. |
| Release hygiene | `CHANGELOG.md`, release README, and BEARING must describe coordinate Optics as complete only after tests prove the public path. | Release gate test or checklist review. |

## Twenty-Slice Delivery Plan

These slices intentionally cover product definition, RED/GREEN execution, docs,
consumer contracts, and release evidence. The branch should pause for drift
check after slice 144 if implementation evidence changes the API shape.

| Slice | Title | Primary Output | Required Evidence |
| --- | --- | --- | --- |
| 133 | Coordinate and basis API decision | Final method names and receipt contracts for Worldline-first optic basis setup and coordinate capture. | Design update plus type sketch; no code work until this is settled. |
| 134 | Package surface decision | Decide root exports versus opaque return types for coordinate, optic/result nouns, and any receipt class. | `index.exports` RED or docs-only decision with test plan update. |
| 135 | Public fixture bridge | Adapt v17 checkpoint-tail fixture to open through `openWarpWorldline(...)`. | RED test proving current public path cannot complete the coordinate optic success story. |
| 136 | Basis setup RED | Add failing test for `worldline.prepareOpticBasis()` or approved equivalent. | Test fails for missing method or missing receipt. |
| 137 | Basis setup GREEN | Implement smallest Worldline-first basis setup path. | Unit/conformance test passes; no graph-first user code in test. |
| 138 | Coordinate capture RED | Add failing test for `worldline.coordinate()` or approved equivalent. | Test fails for missing coordinate API or missing coordinate identity. |
| 139 | Coordinate capture GREEN | Implement smallest coordinate capture path over prepared bounded evidence. | Coordinate object and identity tests pass. |
| 140 | Node optic success RED | Add public `coordinate.optic().node(id).read()` success test with checkpoint-tail identity assertions. | Test fails before success-path fix. |
| 141 | Node optic success GREEN | Make public coordinate node optic success pass through bounded evidence. | Node result and read identity assertions pass. |
| 142 | Property optic success RED | Add public `coordinate.optic().node(id).prop(key).read()` success test. | Test fails before property-path fix or fixture bridge. |
| 143 | Property optic success GREEN | Make public coordinate property optic success pass, including live tail evidence. | Property value, read identity, and tail witness assertions pass. |
| 144 | Coordinate coherence | Prove reads from one coordinate remain stable while the live worldline advances. | Interleaved delete/update tests pass; later coordinate observes later state. |
| 145 | Absence semantics | Lock missing node and missing property result behavior. | Tests plus API docs for absence shapes. |
| 146 | Missing basis recovery | Document and test `E_OPTIC_NO_BOUNDED_BASIS` from public coordinate API. | Failure test, recovery docs, no materialization fallback. |
| 147 | Budget and identity recovery | Document and test `E_OPTIC_TAIL_BUDGET_EXCEEDED` and `E_OPTIC_READ_IDENTITY`. | Budget/identity tests and recovery docs. |
| 148 | Invalid input contract | Decide and test blank node id and property key behavior. | Named Warp error or documented current behavior; no raw internal error. |
| 149 | Consumer type tests | Compile documented setup, coordinate, and optic read examples from package root. | `test:typecheck` includes setup, coordinate, read, result, and negative checks. |
| 150 | Public export audit | Align `index.ts`, package exports, and docs with the coordinate/optic surface decision. | Export tests pass; no accidental internal path dependency. |
| 151 | API and release docs closeout | Update README, API reference, readings guide, migration guide, changelog, release README, BEARING, and backlog status. | Docs show setup, coordinate capture, success, recovery, and bounded scope. |
| 152 | Full verification and evaluation | Run full verification, drift-check the implementation against this PRD, file follow-up debt, and evaluate PR readiness. | Command transcript, drift note, and unresolved-risk list. |

## Traceability Matrix

| Story | Slices | Tests | Docs |
| --- | --- | --- | --- |
| US-001 | 133, 135, 136, 137 | TS-001, TS-002 | API reference, README, readings guide |
| US-002 | 133, 138, 139 | TS-003, TS-004 | API reference, README, readings guide |
| US-003 | 135, 140, 141 | TS-005, TS-006 | API reference, readings guide |
| US-004 | 135, 142, 143 | TS-007, TS-008 | API reference, readings guide |
| US-005 | 144 | TS-009 | API reference, readings guide |
| US-006 | 145, 148 | TS-010, TS-011 | API reference |
| US-007 | 141, 143, 147 | TS-012, TS-016 | Readings guide, recovery docs |
| US-008 | 146, 147 | TS-013, TS-014, TS-015, TS-016 | Migration guide, readings guide |
| US-009 | 149 | TS-017 | API reference |
| US-010 | 134, 150 | TS-018 | API reference, package docs |
| US-011 | 151, 152 | TS-019, TS-020 | BEARING, changelog, release README |
| US-012 | 151 | TS-019 | README, migration guide, release README |

## Release Gate

`v18.0.0` must not be tagged until all of these are true:

- the twenty-slice plan above is either complete or explicitly superseded by a
  committed design update with equal or stronger coverage;
- users can prepare bounded optic basis evidence through the Worldline-first
  public API;
- users can capture a stable coordinate through the Worldline-first public API;
- public node and property optic reads succeed through
  `openWarpWorldline(...).coordinate().optic()`;
- reads from one coordinate stay coherent when the live worldline advances;
- the public setup path does not require first-use users to open
  `openWarpGraph(...)`;
- success and failure tests prove no whole-graph materialization fallback;
- consumer type tests prove the documented API from the package root;
- docs explain setup, coordinate capture, success, absence, and recovery;
- BEARING and the v18 backlog card agree that coordinate Optics closeout is
  complete; and
- full release preflight is rerun from aligned `main` after this work lands.
