---
cycle: 0265
task_id: API_optics-public-api-closeout
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-26
release_home: v18.0.0
backlog:
  - docs/method/backlog/v18.0.0/API_optics-public-api-closeout.md
---

# v18 Optics Public API Closeout

## Pull

Optics are part of the public-facing v18 value proposition. The current
Worldline-first branch exposes `events.optic()`, but the first-use product
story is not complete enough for release:

- the public path can fail with `E_OPTIC_NO_BOUNDED_BASIS` unless a
  checkpoint-tail indexed basis exists;
- the docs show a clean `events.optic().node(...).prop(...).read()` example
  without teaching how the required basis is created or verified;
- the package surface does not yet make an explicit decision about whether
  optic handles and read-result nouns are exported public types or intentionally
  opaque chain-return values;
- consumer-facing tests prove the chain exists, but they do not prove a full
  public success path from `openWarpWorldline(...)`; and
- requiring a new user to recover through the deprecated graph-first surface
  would undermine the v18 Worldline-first product story.

That is an honest foundation, not a release-complete public API.

## Method Contract

| Field | Value |
| --- | --- |
| Sponsor human | James |
| Sponsor agent | Codex |
| Hill | Before `v18.0.0` is tagged or published, a first-use application developer can prepare bounded optic evidence through the Worldline-first public API and run successful node and property optic reads without whole-graph materialization. |
| Agent playback question | Can the repo-visible tests prove the public Worldline-first optic path succeeds, fails explicitly, and never falls back to materialization? |
| Human playback question | Can a new user read the docs, create or verify the required basis without opening legacy graph APIs, and understand how to recover when an optic read fails? |
| Accessibility posture | This is API and documentation work. The accessible path is clear headings, copy-pasteable examples, named errors, and linear recovery steps that do not rely on visual context. |
| Localization posture | Public docs must avoid idioms where precise operational wording is needed; code identifiers remain untranslated and explanatory prose should not depend on English wordplay. |
| Agent inspectability posture | Each slice must leave inspectable evidence in tests, docs, or package exports so later agents can verify the release gate without reconstructing intent from chat. |
| Non-goals | Native Continuum witnesshood, Echo scheduler parity, full observer-plan parity, graph streaming reads and writes, broad graph query replacement, and legacy content/property storage retirement. |

## 1. Feature Overview & Objectives:

### Feature Name

`v18 Optics Public API Closeout`

### One-Sentence Description

Make `openWarpWorldline(...).optic()` release-complete by adding a
Worldline-first bounded-basis setup path, proving public node and property
optic reads, documenting recovery, and locking the consumer TypeScript surface.

### Problem Statement

The v18 branch currently presents Optics as a public capability, but the
first-use path is incomplete. A user can discover `events.optic()` from the
README, migration guide, or API reference, then immediately hit
`E_OPTIC_NO_BOUNDED_BASIS` without a Worldline-first way to create or verify
the required checkpoint-tail indexed basis.

That failure mode makes Optics look like an exposed internal primitive instead
of a product feature. Because v18 is being repositioned around Worldlines and
Optics, shipping this state would be misleading even if the underlying
foundation optics are technically correct.

### Target User/Audience

| Persona | Need | Release Risk If Unserved |
| --- | --- | --- |
| Application developer | Start from `openWarpWorldline(...)`, commit data, prepare optic evidence, and read bounded node/property facts. | v18 appears to expose an API that fails in normal first-use workflows. |
| Tooling author | Use optic read identities and recovery errors to build inspection, replay, or migration tools. | Tools must import internals or branch on unstable errors. |
| Maintainer or release operator | Verify that v18's public claims match tests, docs, exports, and release notes. | Release gates drift and v18 ships with an overstated value proposition. |
| Future Continuum integrator | Treat Optics as one public read shape in the broader witnessed-history protocol story. | v18 creates API debt that must be corrected before v19/v20 Continuum work. |

### Measurable Success Metrics (KPIs)

| KPI | Target | Evidence |
| --- | --- | --- |
| Public optic success coverage | At least one public `openWarpWorldline(...).optic().node(id).read()` test and one public property optic read test pass against real checkpoint-tail indexed evidence. | Conformance or unit tests named in the release witness. |
| No whole-graph fallback | Every new optic success and expected-failure test proves `_materializeGraph()` is not called. | Materialization fallback trap in test fixtures. |
| Documentation completeness | `README.md`, `docs/API_REFERENCE.md`, `docs/READINGS_AND_OPTICS.md`, and `docs/migrations/v18.0.0.md` each explain setup, success, and recovery or intentionally link to a single canonical section. | Docs guard tests plus manual review. |

## 2. Scope Definition:

### In Scope

- A Worldline-first public setup path for bounded optic evidence.
- The default target API is `await worldline.prepareOpticBasis()`.
- Slice 133 may rename the method, but only if it preserves the same product
  behavior and updates this design, tests, docs, and type checks before code
  work continues.
- Public success-path tests for node optic reads through
  `openWarpWorldline(...)`.
- Public success-path tests for node-property optic reads through
  `openWarpWorldline(...)`.
- Proof that public optic reads do not call full materialization.
- Public recovery docs for `E_OPTIC_NO_BOUNDED_BASIS`,
  `E_OPTIC_TAIL_BUDGET_EXCEEDED`, and `E_OPTIC_READ_IDENTITY`.
- Package-surface decision for `WorldlineOptic`, `NodeOpticReadResult`,
  `NodePropertyOpticReadResult`, and any new basis receipt type.
- Consumer type tests that compile documented examples without internal path
  imports.
- API reference, readings guide, migration guide, README, changelog, BEARING,
  and backlog updates for this release blocker.
- Drift check after slice 142 and final go/no-go after slice 152.

### Out of Scope

- Native Continuum contract implementation.
- Echo or Wesley generated-code compatibility beyond keeping Optics honest as
  a public v18 capability.
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
  patch.setProp('event-1', 'status', 'open');
});

await events.prepareOpticBasis();

const node = await events.optic().node('event-1').read();
const status = await events.optic().node('event-1').prop('status').read();
```

The setup method may be implemented on `WarpWorldline` or an equivalent
Worldline-first optic namespace if slice 133 chooses a better shape. It must
not require first-use application developers to open `openWarpGraph(...)` just
to make the documented optic chain usable.

## 3. Detailed User Stories:

| ID | User Story |
| --- | --- |
| US-001 | As an application developer, I want to prepare bounded optic evidence from my `WarpWorldline` so that I do not need to open deprecated graph-first APIs before the first optic read. |
| US-002 | As an application developer, I want to run `events.optic().node(id).read()` successfully so that Optics are not merely an error surface. |
| US-003 | As an application developer, I want to run `events.optic().node(id).prop(key).read()` successfully so that I can read a bounded property value without materializing the graph. |
| US-004 | As an application developer, I want missing nodes and missing properties to have documented result semantics so that I do not confuse absence with transport or parser failure. |
| US-005 | As a tooling author, I want successful optic reads to expose stable read identity evidence so that tools can explain which checkpoint and tail evidence backed the answer. |
| US-006 | As a tooling author, I want optic failures to explain missing bounded evidence so that I can offer the right repair action. |
| US-007 | As a TypeScript consumer, I want the documented optic chain and result handling to type-check from package exports so that I do not import from `src/domain/**`. |
| US-008 | As a maintainer, I want public export decisions for optic nouns to be explicit so that the package surface does not accidentally leak internals. |
| US-009 | As a release operator, I want release docs to block v18 until Optics closeout is complete so that the release does not overclaim product value. |
| US-010 | As a future Continuum integrator, I want v18 Optics docs to name bounded, checkpoint-tail scope precisely so that later Continuum witnesshood work can extend the model without breaking this release. |

## 4. Acceptance Criteria (BDD Format):

| Story | Given | When | Then |
| --- | --- | --- | --- |
| US-001 | A user has a `WarpWorldline` opened with `openWarpWorldline(...)` and has committed at least one node. | The user calls `prepareOpticBasis()` or the final slice-133-approved equivalent. | The method creates or verifies checkpoint-tail indexed evidence and returns a documented receipt without requiring `openWarpGraph(...)`. |
| US-001 | A user calls the basis setup method twice without intervening commits. | The second call runs. | The method is idempotent from the user's perspective and returns a receipt rather than corrupting or duplicating evidence. |
| US-002 | A graph has checkpoint-tail indexed evidence for node `event-1`. | The user opens it with `openWarpWorldline(...)` and calls `events.optic().node('event-1').read()`. | The read returns a live-node result with `nodeId === 'event-1'`, `alive === true`, and a valid read identity. |
| US-002 | A materialization trap is installed on the underlying graph. | The same node optic read succeeds. | The trap is unused, proving the public optic path does not call full materialization. |
| US-003 | A graph has checkpoint-tail indexed evidence and a tail property update for `event-1.status`. | The user calls `events.optic().node('event-1').prop('status').read()`. | The read returns an existing property result with the expected value and read identity. |
| US-003 | A materialization trap is installed on the underlying graph. | The property optic read succeeds. | The trap is unused. |
| US-004 | A graph has bounded evidence but no live node for `missing-node`. | The user reads `events.optic().node('missing-node').read()`. | The result reports the node as not alive using documented fields, without throwing an internal error. |
| US-004 | A graph has a live node with no property for `missing-key`. | The user reads `events.optic().node(id).prop('missing-key').read()`. | The result reports `exists === false` and the documented absent-value shape. |
| US-005 | A node or property optic read succeeds. | The user inspects `readIdentity`. | The identity names the basis and tail evidence needed for replay or diagnosis. |
| US-006 | No bounded optic basis exists. | The user calls the documented optic read path. | The failure is `E_OPTIC_NO_BOUNDED_BASIS` and docs instruct the user to prepare or repair the basis through the Worldline-first setup path. |
| US-006 | The tail exceeds the configured optic budget. | The user calls a node or property optic read. | The failure is `E_OPTIC_TAIL_BUDGET_EXCEEDED` and docs explain checkpoint refresh or budget retry behavior. |
| US-006 | Read identity evidence is unavailable or malformed. | The user calls a node or property optic read. | The failure is `E_OPTIC_READ_IDENTITY` and docs classify it as evidence integrity failure, not ordinary absence. |
| US-007 | A consumer imports only from `@git-stunts/git-warp`. | The consumer compiles the documented setup and optic read examples. | TypeScript succeeds with no internal path imports. |
| US-007 | A consumer tries to import optic internals from `src/domain/**`. | The type-check negative case runs. | The project rejects or avoids documenting that path. |
| US-008 | Maintainers inspect `index.ts`, package exports, and consumer tests. | The release branch is reviewed. | Every optic/result noun is either root-exported as public API or intentionally kept opaque and documented that way. |
| US-009 | Maintainers inspect `docs/BEARING.md`, release notes, and backlog. | The Optics closeout checklist is incomplete. | `v18.0.0` remains blocked. |
| US-010 | A reader compares v18 docs with future Continuum planning. | They read the Optics scope statement. | The docs state that v18 Optics are bounded checkpoint-tail reads, not full Continuum witnesshood or general graph streaming. |

## 5. Detailed Test Plan:

### Test Scenarios

| ID | Layer | Story | Scenario | Fixture/Data | Expected Result |
| --- | --- | --- | --- | --- | --- |
| TS-001 | Unit | US-001 | Basis setup can be invoked from `WarpWorldline`. | Temporary graph with one committed node. | Receipt returned; no `openWarpGraph(...)` required in the user-facing test. |
| TS-002 | Unit | US-001 | Basis setup is repeatable. | Same graph, no intervening commits. | Second call returns a receipt and does not corrupt evidence. |
| TS-003 | Conformance | US-002 | Public worldline node optic read succeeds. | Existing v17 checkpoint-tail optic fixture adapted to public API. | `alive === true`, expected `nodeId`, read identity present. |
| TS-004 | Conformance | US-002 | Node read avoids materialization. | Public fixture plus materialization fallback trap. | Trap unused. |
| TS-005 | Conformance | US-003 | Public worldline property optic read succeeds. | Fixture with checkpoint value and live tail property value. | `exists === true`, expected value, read identity present. |
| TS-006 | Conformance | US-003 | Property read avoids materialization. | Public fixture plus materialization fallback trap. | Trap unused. |
| TS-007 | Unit | US-004 | Missing node result semantics. | Fixture constant `MISSING_NODE_ID`. | Documented not-live result; no internal error. |
| TS-008 | Unit | US-004 | Missing property result semantics. | Live node without requested key. | `exists === false`, documented absent value. |
| TS-009 | Unit | US-005 | Read identity evidence remains stable. | Known checkpoint-tail fixture. | Read identity includes basis and tail evidence fields validated by existing result classes. |
| TS-010 | Unit | US-006 | Missing basis failure. | Worldline with no checkpoint-tail indexed basis. | `E_OPTIC_NO_BOUNDED_BASIS`, no materialization fallback. |
| TS-011 | Unit | US-006 | Unsupported historical selector failure. | Non-live selector passed to worldline optic path. | Fail closed with `E_OPTIC_NO_BOUNDED_BASIS`. |
| TS-012 | Unit | US-006 | Tail budget exceeded failure. | Fixture with budget lower than required tail length. | `E_OPTIC_TAIL_BUDGET_EXCEEDED` and documented recovery context. |
| TS-013 | Unit | US-006 | Read identity failure remains explicit. | Malformed or unavailable identity fixture. | `E_OPTIC_READ_IDENTITY` and no absence-shaped result. |
| TS-014 | Type check | US-007 | Public import example compiles. | `test/type-check/consumer.ts`. | No internal imports needed for documented setup and optic reads. |
| TS-015 | Type check | US-007 | Unsupported internal assumptions stay undocumented. | Negative `@ts-expect-error` examples. | Compiler catches unsupported use. |
| TS-016 | Unit | US-008 | Root export audit. | `test/unit/index.exports.test.ts`. | Exports match the chosen public/opaque optic surface. |
| TS-017 | Docs guard | US-009 | Release docs name Optics blocker. | `docs/BEARING.md`, release README, changelog. | v18 remains blocked until closeout. |
| TS-018 | Docs guard | US-010 | Docs state bounded checkpoint-tail scope. | API reference, readings guide, migration guide. | No claim of full Continuum or graph streaming support. |
| TS-019 | Integration | US-001 to US-003 | Full public setup plus node/property reads. | Temp persistence adapter through public entrypoint. | Setup, node read, property read all pass without materialization. |
| TS-020 | Release gate | US-009 | Preflight after all slices. | Local repo state. | Lint, typecheck, tests, docs guard, and coverage-relevant suites pass. |

### Happy Path Testing

1. Create a temporary persistence root using the same adapter family documented
   for first-use application code.
2. Open a `WarpWorldline` with `openWarpWorldline({ persistence,
   worldlineName, writerId })`.
3. Commit a node and property through `worldline.commit(...)`.
4. Call the Worldline-first basis setup method.
5. Assert that the returned basis receipt names enough public evidence for
   docs and diagnosis.
6. Install or configure the materialization fallback trap used by existing
   optic tests.
7. Read `worldline.optic().node(nodeId).read()`.
8. Assert `nodeId`, `alive`, read identity, and trap-unused evidence.
9. Read `worldline.optic().node(nodeId).prop(key).read()`.
10. Assert `nodeId`, `key`, `exists`, `value`, read identity, and trap-unused
    evidence.
11. Reopen the same `worldlineName` with `openWarpWorldline(...)`.
12. Repeat the node and property reads to prove setup survives process-local
    object lifetime.

### Negative/Edge Case Testing

| Case | Setup | Expected Behavior |
| --- | --- | --- |
| Missing basis | Commit data, skip basis setup, call optic read. | Fail with `E_OPTIC_NO_BOUNDED_BASIS`; docs point to Worldline-first setup. |
| Empty worldline name | Call `openWarpWorldline(...)` with blank identity. | Existing `E_WARP_WORLDLINE_IDENTITY` behavior remains covered. |
| Empty writer id | Call `openWarpWorldline(...)` with blank writer id. | Existing `E_WARP_WORLDLINE_IDENTITY` behavior remains covered. |
| Empty node id | Call `worldline.optic().node('')`. | Either reject with a named Warp error or document why existing behavior is valid; no raw internal error. |
| Empty property key | Call `worldline.optic().node(id).prop('')`. | Either reject with a named Warp error or document why existing behavior is valid; no raw internal error. |
| Missing node | Read a node not present in bounded evidence. | Return documented not-live result. |
| Missing property | Read a property absent from a live node. | Return `exists === false` with documented absent value. |
| Unsupported selector | Seek or construct an unsupported non-live optic selector. | Fail closed with `E_OPTIC_NO_BOUNDED_BASIS`; no silent retargeting to live. |
| Tail budget exceeded | Force budget below the fixture tail length. | Fail with `E_OPTIC_TAIL_BUDGET_EXCEEDED`; recovery docs name checkpoint refresh or budget retry. |
| Broken persistence | Configure adapter to fail while preparing basis or reading evidence. | Surface an expected Warp error or existing adapter error without converting it into absence. |
| Concurrent writers | Create basis, append a tail patch from another writer, read property. | Read either includes bounded tail evidence or fails explicitly if outside budget; never materializes. |
| Concurrent basis setup | Two callers prepare basis for the same worldline concurrently. | Compare-and-swap semantics or existing checkpoint behavior prevents corruption; test documents observed outcome. |
| Corrupt checkpoint index | Remove or corrupt index shard in fixture. | Fail with `E_OPTIC_NO_BOUNDED_BASIS` or `E_OPTIC_READ_IDENTITY` according to existing optic error contract. |
| Timeout or long tail | Simulate long tail with low budget. | Deterministic budget failure, not wall-clock-dependent timeout behavior in domain code. |

### Non-Functional Testing

| Area | Requirement | Evidence |
| --- | --- | --- |
| Performance | Public node and property optic reads must avoid full materialization. | Materialization trap tests. |
| Load | Tail scanning must remain bounded by explicit budget semantics and must not depend on ambient time. | Tail-budget tests and no new domain wall-clock usage. |
| Determinism | Same checkpoint-tail evidence must produce the same optic result across reopen. | Reopen/read conformance test. |
| Security | Optic setup and reads must not bypass observer/aperture documentation; docs must state current authority model honestly. | API reference and readings guide review. |
| Type safety | No `any`, `unknown`, cast bridges, or internal imports in the public optic implementation or tests. | Lint, typecheck, anti-sludge review. |
| Accessibility | Docs must use structured headings, named errors, and copy-pasteable code blocks with language tags. | Markdown lint plus manual docs review. |
| Release hygiene | `CHANGELOG.md`, release README, and BEARING must describe Optics as complete only after tests prove the public path. | Release gate test or checklist review. |

## Twenty-Slice Delivery Plan

These slices intentionally cover product definition, RED/GREEN execution, docs,
consumer contracts, and release evidence. The branch should pause for drift
check after slice 142 if implementation evidence changes the API shape.

| Slice | Title | Primary Output | Required Evidence |
| --- | --- | --- | --- |
| 133 | Basis setup API decision | Final method name and receipt contract for Worldline-first optic basis setup. | Design update plus type sketch; no code work until this is settled. |
| 134 | Package surface decision | Decide root exports versus opaque return types for optic/result nouns and any receipt class. | `index.exports` RED or docs-only decision with test plan update. |
| 135 | Public fixture bridge | Adapt v17 checkpoint-tail fixture to open through `openWarpWorldline(...)`. | RED test proving current public path cannot complete the success story. |
| 136 | Basis setup RED | Add failing test for `worldline.prepareOpticBasis()` or approved equivalent. | Test fails for missing method or missing receipt. |
| 137 | Basis setup GREEN | Implement smallest Worldline-first basis setup path. | Unit/conformance test passes; no graph-first user code in test. |
| 138 | Node optic success RED | Add public `events.optic().node(id).read()` success test with materialization trap. | Test fails before success-path fix. |
| 139 | Node optic success GREEN | Make public node optic success pass through bounded evidence. | Node result and trap-unused assertions pass. |
| 140 | Property optic success RED | Add public `events.optic().node(id).prop(key).read()` success test. | Test fails before property-path fix or fixture bridge. |
| 141 | Property optic success GREEN | Make public property optic success pass, including live tail evidence. | Property value, read identity, and trap-unused assertions pass. |
| 142 | Absence semantics | Lock missing node and missing property result behavior. | Tests plus API docs for absence shapes. |
| 143 | Missing basis recovery | Document and test `E_OPTIC_NO_BOUNDED_BASIS` from public API. | Failure test, recovery docs, no materialization fallback. |
| 144 | Tail budget recovery | Document and test `E_OPTIC_TAIL_BUDGET_EXCEEDED`. | Budget test and recovery docs. |
| 145 | Read identity recovery | Document and test `E_OPTIC_READ_IDENTITY` as evidence failure. | Failure test or fixture guard plus docs. |
| 146 | Invalid input contract | Decide and test blank node id and property key behavior. | Named Warp error or documented current behavior; no raw internal error. |
| 147 | Consumer type tests | Compile documented optic setup and read examples from package root. | `test:typecheck` includes setup, read, result, and negative checks. |
| 148 | Public export audit | Align `index.ts`, package exports, and docs with the surface decision. | Export tests pass; no accidental internal path dependency. |
| 149 | API docs closeout | Update README, API reference, readings guide, and migration guide. | Docs show setup, success, recovery, and bounded scope. |
| 150 | Release docs closeout | Update changelog, release README, BEARING, and backlog status. | Release gate states Optics blocker is closed only if tests are green. |
| 151 | Full verification | Run lint, typecheck, local tests, docs guards, and targeted conformance. | Command transcript captured in PR or final report. |
| 152 | Drift check and PR | Compare implementation against this PRD, file follow-up debt, open PR. | Drift note, PR description, and unresolved-risk list. |

## Traceability Matrix

| Story | Slices | Tests | Docs |
| --- | --- | --- | --- |
| US-001 | 133, 135, 136, 137 | TS-001, TS-002, TS-019 | API reference, README, readings guide |
| US-002 | 135, 138, 139 | TS-003, TS-004, TS-019 | API reference, readings guide |
| US-003 | 135, 140, 141 | TS-005, TS-006, TS-019 | API reference, readings guide |
| US-004 | 142, 146 | TS-007, TS-008 | API reference |
| US-005 | 139, 141, 145 | TS-009, TS-013 | Readings guide, recovery docs |
| US-006 | 143, 144, 145 | TS-010, TS-011, TS-012, TS-013 | Migration guide, readings guide |
| US-007 | 147 | TS-014, TS-015 | API reference |
| US-008 | 134, 148 | TS-016 | API reference, package docs |
| US-009 | 150, 151, 152 | TS-017, TS-020 | BEARING, changelog, release README |
| US-010 | 149, 150 | TS-018 | README, migration guide, release README |

## Release Gate

`v18.0.0` must not be tagged until all of these are true:

- the twenty-slice plan above is either complete or explicitly superseded by a
  committed design update with equal or stronger coverage;
- public node and property optic reads succeed through `openWarpWorldline(...)`;
- the public setup path does not require first-use users to open
  `openWarpGraph(...)`;
- success and failure tests prove no whole-graph materialization fallback;
- consumer type tests prove the documented API from the package root;
- docs explain setup, success, absence, and recovery;
- BEARING and the v18 backlog card agree that Optics closeout is complete; and
- full release preflight is rerun from aligned `main` after this work lands.
