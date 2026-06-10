# ROADMAP - @git-stunts/git-warp

Last reconciled: 2026-06-06

**Current public package/tag release:** v17.0.0
**Next intended release:** v18.0.0

v17.0.1 repair work is recorded in source docs/changelog without public npm/tag evidence.

GitHub Issues are the live Method tracker. This roadmap is an issue-indexed planning view over the current open issue set, not a second backlog. If this document and GitHub disagree, GitHub wins and this document should be regenerated or corrected.

The major-version ladder follows VISION: v18 makes the graph substrate honest, v19 makes observer/runtime doctrine honest, v20 makes slice-first streaming execution ordinary, and v21 makes distributed/plural admission semantics runtime-real.

No release slot may carry more than 50 open issues. If a bucket crosses that line, split it into explicit patch or minor waves before treating it as a coherent release plan.

## Active Planning Instance

The active roadmap instance uses the formal planning system in
[roadmap-planning.md](method/roadmap-planning.md). The issue tables below remain
the complete open-issue inventory. This section is the release-scale execution
view: goalposts, proof stories, slice budgets, release gates, and next
goalpost.

### v18.0.0 - Graph Substrate Honesty Release

| Field | Value |
| --- | --- |
| Release id | `v18.0.0` |
| Release status | `active` |
| Current public release | `v17.0.0` |
| Goalposts | `5` |
| Landed goalposts | `4` |
| Total planned slice budget | `53` |
| Target milestone | `v18.0.0` |
| Release evidence packet | `docs/releases/v18.0.0/README.md` |

v18.0.0 is ready only when every goalpost below is landed, every issue in the
`v18.0.0` milestone is closed, superseded work has been closed or moved out of
the target milestone with linked disposition, the release evidence packet is
complete and placeholder-free, and `npm run release:preflight` passes from
aligned `main`.

| Goalpost | Status | Slice budget | Umbrella or tracker issue | Goalpost doc | Release gate |
| --- | --- | ---: | --- | --- | --- |
| V18-GP1 Optics Public API Closeout | landed | 20 | [#547](https://github.com/git-stunts/git-warp/issues/547) | [v18-gp1-optics-public-api-closeout.md](method/roadmap/v18.0.0/v18-gp1-optics-public-api-closeout.md) | First-use Optics are usable and honest without hidden full materialization. |
| V18-GP2 Bounded-Memory Large-Graph Product Gate | landed | 15 | [#549](https://github.com/git-stunts/git-warp/issues/549) | [v18-gp2-bounded-memory-large-graph-gate.md](method/roadmap/v18.0.0/v18-gp2-bounded-memory-large-graph-gate.md) | Normal public reads, writes, content lookup, and sync must honor an explicit memory budget. |
| V18-GP3 Content Attachment Plane Honesty | landed | 4 | [#550](https://github.com/git-stunts/git-warp/issues/550) | [v18-gp3-content-attachment-plane-honesty.md](method/roadmap/v18.0.0/v18-gp3-content-attachment-plane-honesty.md) | Release claims now distinguish typed attachment-plane progress from accepted legacy storage residuals. |
| V18-GP4 Holographic Slicing And Checkpoint Basis | landed | 8 | [#626](https://github.com/git-stunts/git-warp/issues/626), [#628](https://github.com/git-stunts/git-warp/issues/628)-[#635](https://github.com/git-stunts/git-warp/issues/635) | [v18-gp4-holographic-slicing-checkpoint-basis.md](method/roadmap/v18.0.0/v18-gp4-holographic-slicing-checkpoint-basis.md) | Normal public graph-shaped reads now have bounded, witnessed slices over declared basis. |
| V18-GP5 Release Operation Evidence | active | 6 | [#552](https://github.com/git-stunts/git-warp/issues/552) | [v18-gp5-release-operation-evidence.md](method/roadmap/v18.0.0/v18-gp5-release-operation-evidence.md) | Tagging and publishing must satisfy the release policy and record deterministic evidence. |

Sequencing:

```text
V18-GP4 Holographic slicing basis
  -> V18-GP1 Optics public API closeout
  -> V18-GP2 Bounded-memory product gate
  -> V18-GP3 Content attachment honesty
  -> V18-GP5 Release operation evidence
```

V18-GP1, V18-GP2, V18-GP3, and V18-GP4 are landed. The next release-blocking
target is V18-GP5 [#552](https://github.com/git-stunts/git-warp/issues/552),
which owns release operation evidence and must not be completed before explicit
tag approval.

Release progress should be reported as:

```text
v18.0.0 goalposts: 4/5 landed
v18.0.0 slices: 47/53 landed
next goalpost: V18-GP5 Release Operation Evidence
next slice: reconcile #552 against current issue metadata and release evidence
```

## Pre-Migration Snapshot

This snapshot records the legacy label state before the 2026-06-10 simplified
taxonomy migration. Current planning authority lives in GitHub milestones and
the `type:*`, `priority:*`, `status:*`, and `area:*` label axes.

| Metric | Count |
| --- | ---: |
| Open GitHub issues indexed | 407 |
| `lane:bad-code` maintenance issues | 214 |
| `lane:cool-ideas` enhancement issues | 95 |
| `lane:release` issues | 20 |
| Blocked issues | 39 |
| Unlabeled issues | 1 |

## Release Assignment Rules

- Issues in a version milestone are hard release-plan issues for that version.
- No planned release slot may contain more than 50 open issues. Oversized
  buckets must be split into explicit patch or minor waves.
- Legacy `release-home:*` labels are migration inputs only. Convert them to
  GitHub milestones before treating the release bucket as authoritative.
- Legacy `lane:*`, `feature:*`, and `legend:*` labels are migration inputs only.
  Convert active issue state to `type:*`, `priority:*`, `status:*`, and
  `area:*`.
- Issues without a milestone are assigned by area: observer work to v19,
  streaming/materialization work to v20, merge/strand/worldline work to v21,
  and docs/testing/tooling/runtime-boundary hardening to v18.
- This is a proposed roadmap. Changing a GitHub issue milestone is the
  authoritative way to move an issue between release slots.

## Proposed Release Buckets

| Release Slot | Count | Planning Intent |
| --- | ---: | --- |
| v18.0.0 | 2 | Ship only after bounded-memory public paths and release operation evidence are coherent. |
| v18.0.1 | 50 | Repair public docs, examples, release tooling, and review guardrails that make the v18 line usable without expanding the runtime ontology. |
| v18.0.2 | 50 | Finish the remaining release-tooling spillover, then start the testing-quality cleanup wave with behavior-backed proofs instead of brittle text checks. |
| v18.0.3 | 50 | Continue static-text and fixture-quality paydown while keeping the release train small enough to review as one coherent patch wave. |
| v18.0.4 | 15 | Close the leftover v18 patch-train testing issues and completion-scanner ideas after the larger harness waves have landed. |
| v18.1.0 | 36 | Pay down API capability, public-surface, command, and materializing-API removal work after the v18.0 public line is honest. |
| v18.1.1 | 34 | Turn runtime boundary, wire-format, port, policy, and serialization contracts into explicit runtime-backed surfaces. |
| v18.1.2 | 16 | Finish trie/state-storage residue and the v17 checkpoint-tail optic carry-forward without overloading the API or boundary waves. |
| v18.2.0 | 5 | Tighten command coverage, issue triage, public docs automation, and package-surface hygiene without expanding the runtime ontology. |
| v19.0.0 | 30 | Make observer doctrine runtime-real beyond the v18 bounded public-path gate: observer-readable receipts, support rules, plans, envelopes, fragments, and witnessed suffix shells. |
| v19.1.0 | 30 | Advance trust/security contracts, sync authentication, protocol alignment, and policy surfaces once observer boundaries are stable enough to protect. |
| v19.2.0 | 6 | Package extraction, multi-package release, MCP, and integration architecture that should follow the v19 observer model rather than constrain it prematurely. |
| v20.0.0 | 19 | Make slice-first, bounded, streaming read/write execution ordinary runtime behavior rather than special-case gate evidence. |
| v20.1.0 | 23 | Reshape indexes, materialization controllers, async traversal, and diagnostics around bounded support instead of full-state residency. |
| v21.0.0 | 36 | Make distributed/plural admission semantics runtime-real: merge classifiers, braid collapse, local sites, and strand/worldline merge nouns. |
| v21.1.0 | 1 | Stabilize WESLEY and Continuum contract surfaces after the merge runtime nouns are no longer speculative. |
| future | 4 | Issues without enough signal for a release slot. They stay visible here until labels or designs make a sharper call possible. |

## Legacy Label Counts At Migration Start

### Lanes

| Label | Count |
| --- | ---: |
| lane:bad-code | 214 |
| lane:cool-ideas | 95 |
| lane:up-next | 43 |
| lane:backlog-root | 30 |
| lane:release | 20 |
| lane:v18.0.0 | 2 |
| lane:v19.0.0 | 11 |
| lane:inbox | 4 |
| lane:v21.0.0 | 4 |
| lane:v20.0.0 | 3 |

### Types

| Label | Count |
| --- | ---: |
| type:maintenance | 214 |
| type:enhancement | 192 |

### Release Home Labels

| Label | Count |
| --- | ---: |
| release-home:v17.0.0 | 162 |
| release-home:v18.0.0 | 22 |
| release-home:v20.0.0 | 15 |
| release-home:v19.0.0 | 13 |
| release-home:v21.0.0 | 7 |

### Feature Labels

| Label | Count |
| --- | ---: |
| feature:testing-quality | 113 |
| feature:merge-strands-worldlines | 50 |
| feature:runtime-boundaries | 36 |
| feature:api-capabilities | 35 |
| feature:docs-dx | 34 |
| feature:materialization-query-index | 26 |
| feature:sync-trust-security | 30 |
| feature:observer-admission-runtime | 27 |
| feature:tooling-release | 27 |
| feature:trie-state-storage | 16 |
| feature:graph-model-substrate | 3 |
| feature:btr-provenance-boundary | 1 |
| feature:materialization-snapshotting | 1 |
| feature:materialized-index | 1 |
| feature:protocol-alignment | 1 |
| feature:v17-optics-checkpoint-tail | 1 |

## Roadmap Tables

Each issue appears once in the proposed release tables below. `Status` is derived from GitHub issue state plus workflow labels: closed issues become `Closed` or `Done`, open blocked issues become `Blocked`, open work-in-progress issues become `Work in progress`, and the remaining open issues stay `Open`.

### v18.0.0 - Public Release Gate

Ship only after bounded-memory public paths and release operation evidence are coherent.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#549](https://github.com/git-stunts/git-warp/issues/549) | Bounded-memory large-graph product gate | Closed | enhancement | release, v18.0.0 | graph-model-substrate | - | release |
| [#552](https://github.com/git-stunts/git-warp/issues/552) | v18 public release blockers | Blocked | release | release, v18.0.0 | graph-model-substrate | - | blocked, release |

### v18.0.1 - Public Docs And Release Tooling Repair

Repair public docs, examples, release tooling, and review guardrails that make the v18 line usable without expanding the runtime ontology.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#112](https://github.com/git-stunts/git-warp/issues/112) | API Examples Review Checklist | Open | enhancement | backlog-root | docs-dx | - | - |
| [#113](https://github.com/git-stunts/git-warp/issues/113) | Archived Doc Status Guardrail | Open | enhancement | backlog-root | docs-dx | - | - |
| [#114](https://github.com/git-stunts/git-warp/issues/114) | Batch Review Fix Commits | Open | enhancement | backlog-root | tooling-release | - | - |
| [#117](https://github.com/git-stunts/git-warp/issues/117) | Contributor Review-Loop Hygiene Guide | Open | enhancement | backlog-root | docs-dx | - | - |
| [#119](https://github.com/git-stunts/git-warp/issues/119) | Docs Consistency Preflight | Open | enhancement | backlog-root | tooling-release | - | - |
| [#120](https://github.com/git-stunts/git-warp/issues/120) | Docs-Version-Sync Pre-Commit Check | Open | enhancement | backlog-root | tooling-release | - | - |
| [#121](https://github.com/git-stunts/git-warp/issues/121) | Fix JSR Publish Dry-Run Deno Panic | Open | enhancement | backlog-root | tooling-release | - | - |
| [#122](https://github.com/git-stunts/git-warp/issues/122) | `scripts/pr-ready` Merge-Readiness CLI | Open | enhancement | backlog-root | tooling-release | - | - |
| [#125](https://github.com/git-stunts/git-warp/issues/125) | Docs: README Install Section | Open | enhancement | backlog-root | docs-dx | - | - |
| [#126](https://github.com/git-stunts/git-warp/issues/126) | Document readonly receipt arrays | Open | enhancement | backlog-root | docs-dx | - | - |
| [#127](https://github.com/git-stunts/git-warp/issues/127) | Review bot warning policy | Open | enhancement | backlog-root | tooling-release | - | - |
| [#128](https://github.com/git-stunts/git-warp/issues/128) | RFC Field Count Drift Detector | Open | enhancement | backlog-root | docs-dx | - | - |
| [#133](https://github.com/git-stunts/git-warp/issues/133) | WarpGraph Constructor Lifecycle Docs | Open | enhancement | backlog-root | docs-dx | - | - |
| [#135](https://github.com/git-stunts/git-warp/issues/135) | Benchmark Budgets + CI Regression Gate | Open | enhancement | backlog-root | tooling-release | - | - |
| [#155](https://github.com/git-stunts/git-warp/issues/155) | @git-stunts/trailer-codec type poison at the boundary | Open | maintenance | bad-code | tooling-release | v17.0.0 | bad-code |
| [#160](https://github.com/git-stunts/git-warp/issues/160) | Reducer silently no-ops unknown op types — typos become silent data loss | Open | maintenance | bad-code | docs-dx | v18.0.0 | bad-code |
| [#165](https://github.com/git-stunts/git-warp/issues/165) | Machine-local path literals in backlog docs | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#172](https://github.com/git-stunts/git-warp/issues/172) | IndexRebuildService has 5 performance.now() calls for profiling | Open | maintenance | bad-code | tooling-release | v17.0.0 | bad-code |
| [#187](https://github.com/git-stunts/git-warp/issues/187) | BunHttpAdapter/DenoHttpAdapter reference undeclared global types | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#202](https://github.com/git-stunts/git-warp/issues/202) | TrustAssessment is a typedef-only domain concept | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#227](https://github.com/git-stunts/git-warp/issues/227) | materialize() requires empty options object — DX friction | Open | maintenance | bad-code | tooling-release | v17.0.0 | bad-code |
| [#233](https://github.com/git-stunts/git-warp/issues/233) | 49 silent catch blocks across the codebase | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#257](https://github.com/git-stunts/git-warp/issues/257) | Capability interfaces lack JSDoc on individual methods | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#264](https://github.com/git-stunts/git-warp/issues/264) | Public docs still teach the materialization frontdoor | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#265](https://github.com/git-stunts/git-warp/issues/265) | Error code naming inconsistency across throw sites | Open | maintenance | bad-code | tooling-release | v17.0.0 | bad-code |
| [#269](https://github.com/git-stunts/git-warp/issues/269) | index.d.ts is hand-maintained — should be generated | Open | maintenance | bad-code | tooling-release | v17.0.0 | bad-code |
| [#273](https://github.com/git-stunts/git-warp/issues/273) | PROTO_js-test-typecheck-drift | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#278](https://github.com/git-stunts/git-warp/issues/278) | SPEC required link check path filter | Open | maintenance | bad-code | tooling-release | v17.0.0 | bad-code |
| [#367](https://github.com/git-stunts/git-warp/issues/367) | WarpStream architecture has no user-facing documentation | Open | maintenance | bad-code | docs-dx | v17.0.0 | bad-code |
| [#371](https://github.com/git-stunts/git-warp/issues/371) | SPEC_v17-release-self-review-blockers | Open | maintenance | bad-code | tooling-release | v17.0.0 | bad-code |
| [#401](https://github.com/git-stunts/git-warp/issues/401) | Expand ADVANCED_GUIDE.md with trust, performance, and checkpoints | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#402](https://github.com/git-stunts/git-warp/issues/402) | Advanced multi-writer workflow documentation | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#408](https://github.com/git-stunts/git-warp/issues/408) | Clarify scope boundaries between BEARING.md and VISION.md | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#417](https://github.com/git-stunts/git-warp/issues/417) | DX_dead-export-ratchet | Open | enhancement | cool-ideas | tooling-release | - | idea |
| [#419](https://github.com/git-stunts/git-warp/issues/419) | Documentation freshness ratchet | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#421](https://github.com/git-stunts/git-warp/issues/421) | `git warp explain` — trace a value's admission history | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#423](https://github.com/git-stunts/git-warp/issues/423) | Graft cool ideas (post-Phase 1) | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#438](https://github.com/git-stunts/git-warp/issues/438) | Systems-Style Scorecard as pre-commit hook | Open | enhancement | cool-ideas | tooling-release | - | idea |
| [#442](https://github.com/git-stunts/git-warp/issues/442) | Mechanical tsc autofix tool | Open | enhancement | cool-ideas | tooling-release | - | idea |
| [#443](https://github.com/git-stunts/git-warp/issues/443) | V17 release readiness dashboard | Open | enhancement | cool-ideas | tooling-release | - | idea |
| [#444](https://github.com/git-stunts/git-warp/issues/444) | Doc-as-test pipeline: run code snippets from docs as tests | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#446](https://github.com/git-stunts/git-warp/issues/446) | Namespace duality guide: flat vs architectural access | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#450](https://github.com/git-stunts/git-warp/issues/450) | Use @git-stunts/vault for trust signing keys | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#459](https://github.com/git-stunts/git-warp/issues/459) | Agent-first merge surfaces | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#462](https://github.com/git-stunts/git-warp/issues/462) | Canonicalization optics | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#466](https://github.com/git-stunts/git-warp/issues/466) | Common-basis braid explainer | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#477](https://github.com/git-stunts/git-warp/issues/477) | WARP provenance layer for safe-context | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#487](https://github.com/git-stunts/git-warp/issues/487) | Content-addressed witnesses in git-cas | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#510](https://github.com/git-stunts/git-warp/issues/510) | Fix current npm audit findings for brace-expansion and tmp | Open | enhancement | up-next | tooling-release | - | - |
| [#514](https://github.com/git-stunts/git-warp/issues/514) | Reconcile namespace notation across VISION.md, README.md, ARCHITECTURE.md | Open | enhancement | up-next | docs-dx | - | - |

### v18.0.2 - Test Harness Quality Wave A

Finish the remaining release-tooling spillover, then start the testing-quality cleanup wave with behavior-backed proofs instead of brittle text checks.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#576](https://github.com/git-stunts/git-warp/issues/576) | BAD: first-use docs are caveated because normal reads lack bounded providers | Blocked | maintenance | bad-code | docs-dx | v18.0.0 | blocked, bad-code |
| [#578](https://github.com/git-stunts/git-warp/issues/578) | COOL: generate first-use docs guards from the public API cost inventory | Blocked | enhancement | cool-ideas | docs-dx | v18.0.0 | blocked, idea |
| [#602](https://github.com/git-stunts/git-warp/issues/602) | COOL IDEA: batch PR witness dashboard | Open | enhancement | cool-ideas | tooling-release | - | idea |
| [#603](https://github.com/git-stunts/git-warp/issues/603) | COOL IDEA: issue completion scanner | Open | enhancement | cool-ideas | tooling-release | - | idea |
| [#618](https://github.com/git-stunts/git-warp/issues/618) | Open issue counts do not distinguish PR-covered work | Open | maintenance | bad-code | tooling-release | v18.0.0 | bad-code |
| [#116](https://github.com/git-stunts/git-warp/issues/116) | Consumer Test Type-Only Import Coverage | Open | enhancement | backlog-root | testing-quality | - | - |
| [#118](https://github.com/git-stunts/git-warp/issues/118) | Deno Smoke Test | Open | enhancement | backlog-root | testing-quality | - | - |
| [#124](https://github.com/git-stunts/git-warp/issues/124) | Pure TypeScript Example App | Open | enhancement | backlog-root | testing-quality | - | - |
| [#130](https://github.com/git-stunts/git-warp/issues/130) | Test-File Wildcard Ratchet | Open | enhancement | backlog-root | testing-quality | - | - |
| [#132](https://github.com/git-stunts/git-warp/issues/132) | Vitest Explicit Runtime Excludes | Open | enhancement | backlog-root | testing-quality | - | - |
| [#148](https://github.com/git-stunts/git-warp/issues/148) | CheckpointSerializerV5 returns empty state for null/undefined input | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#156](https://github.com/git-stunts/git-warp/issues/156) | callInternalRuntimeMethod walks prototype chains | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#158](https://github.com/git-stunts/git-warp/issues/158) | PROTO_materialize-controller-seek-cache-error-opacity | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#173](https://github.com/git-stunts/git-warp/issues/173) | MessageCodecInternal imports @git-stunts/trailer-codec in domain | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#193](https://github.com/git-stunts/git-warp/issues/193) | JoinReducer accepts NodeRemove/EdgeRemove with empty observedDots and no node/edge fields | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#203](https://github.com/git-stunts/git-warp/issues/203) | TrustState constructor validates nothing and exposes mutable Maps | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#211](https://github.com/git-stunts/git-warp/issues/211) | CheckpointController mixes checkpoint, GC, and migration | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#218](https://github.com/git-stunts/git-warp/issues/218) | EffectPipeline uses module-level mutable counter | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#221](https://github.com/git-stunts/git-warp/issues/221) | InMemoryGraphAdapter has module-level mutable global state | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#224](https://github.com/git-stunts/git-warp/issues/224) | 48 functions exceed the 50-line limit | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#231](https://github.com/git-stunts/git-warp/issues/231) | QueryController.hasNode assigned via external prototype mutation | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#246](https://github.com/git-stunts/git-warp/issues/246) | GitGraphAdapter exposes this.plumbing as public | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#255](https://github.com/git-stunts/git-warp/issues/255) | Sludge map has no formal JSON schema | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#259](https://github.com/git-stunts/git-warp/issues/259) | CC_codec-module-untested | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#271](https://github.com/git-stunts/git-warp/issues/271) | IndexRebuildService tests check method existence, not correctness | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#275](https://github.com/git-stunts/git-warp/issues/275) | PatchSession.js (349 LOC) has zero tests and parses error messages | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#281](https://github.com/git-stunts/git-warp/issues/281) | StateReaderV5.js (599 LOC) has zero tests | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#287](https://github.com/git-stunts/git-warp/issues/287) | Static text assertions in `test/unit/scripts/capability-consumer-migration-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#288](https://github.com/git-stunts/git-warp/issues/288) | Static text assertions in `test/unit/scripts/capability-interfaces-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#289](https://github.com/git-stunts/git-warp/issues/289) | Static text assertions in `test/conformance/castQuarantineGraduation.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#290](https://github.com/git-stunts/git-warp/issues/290) | Static text assertions in `test/unit/scripts/changelog-config-extension-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#291](https://github.com/git-stunts/git-warp/issues/291) | Static text assertions in `test/unit/scripts/cli-guide-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#292](https://github.com/git-stunts/git-warp/issues/292) | Static text assertions in `test/conformance/comparisonLiveCoordinateSeam.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#293](https://github.com/git-stunts/git-warp/issues/293) | Static text assertions in `test/conformance/conflictTargetIdentityFakeModelGraduation.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#294](https://github.com/git-stunts/git-warp/issues/294) | Static text assertions in `test/unit/scripts/contamination-dynamic-imports-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#295](https://github.com/git-stunts/git-warp/issues/295) | Static text assertions in `test/unit/scripts/content-access-duplication-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#296](https://github.com/git-stunts/git-warp/issues/296) | Static text assertions in `test/unit/scripts/dead-code-cleanup-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#297](https://github.com/git-stunts/git-warp/issues/297) | Static text assertions in `test/unit/scripts/delete-warpruntime-class-split.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#298](https://github.com/git-stunts/git-warp/issues/298) | Static text assertions in `test/unit/scripts/documentation-corpus-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#299](https://github.com/git-stunts/git-warp/issues/299) | Static text assertions in `test/unit/domain/trust/domainPurity.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#300](https://github.com/git-stunts/git-warp/issues/300) | Static text assertions in `test/unit/scripts/factory-functions-in-tests-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#301](https://github.com/git-stunts/git-warp/issues/301) | Static text assertions in `test/unit/infrastructure/adapters/GitGraphAdapter.gitCasPersistence.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#302](https://github.com/git-stunts/git-warp/issues/302) | Static text assertions in `test/unit/scripts/glossary-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#304](https://github.com/git-stunts/git-warp/issues/304) | Static text assertions in `test/conformance/hygieneQuarantineGraduation.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#305](https://github.com/git-stunts/git-warp/issues/305) | Static text assertions in `test/conformance/immutableSnapshotBuilder.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#306](https://github.com/git-stunts/git-warp/issues/306) | Static text assertions in `test/unit/scripts/incremental-index-updater-closeout-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#307](https://github.com/git-stunts/git-warp/issues/307) | Static text assertions in `test/unit/scripts/index-builder-on-git-cas-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#308](https://github.com/git-stunts/git-warp/issues/308) | Static text assertions in `test/unit/scripts/internal-runtime-shim-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#309](https://github.com/git-stunts/git-warp/issues/309) | Static text assertions in `test/unit/scripts/kill-warpruntime-split.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#311](https://github.com/git-stunts/git-warp/issues/311) | Static text assertions in `test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |

### v18.0.3 - Test Harness Quality Wave B

Continue static-text and fixture-quality paydown while keeping the release train small enough to review as one coherent patch wave.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#314](https://github.com/git-stunts/git-warp/issues/314) | Static text assertions in `test/unit/scripts/observer-geometry-ladder-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#320](https://github.com/git-stunts/git-warp/issues/320) | Static text assertions in `test/unit/scripts/public-api-advanced-guide-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#322](https://github.com/git-stunts/git-warp/issues/322) | Static text assertions in `test/unit/scripts/public-api-cost-signaling.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#324](https://github.com/git-stunts/git-warp/issues/324) | Static text assertions in `test/unit/scripts/public-api-getting-started-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#325](https://github.com/git-stunts/git-warp/issues/325) | Static text assertions in `test/unit/scripts/public-api-guide-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#326](https://github.com/git-stunts/git-warp/issues/326) | Static text assertions in `test/unit/scripts/public-api-observer-label.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#327](https://github.com/git-stunts/git-warp/issues/327) | Static text assertions in `test/unit/scripts/public-api-observer-noun.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#328](https://github.com/git-stunts/git-warp/issues/328) | Static text assertions in `test/unit/scripts/public-api-readme-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#329](https://github.com/git-stunts/git-warp/issues/329) | Static text assertions in `test/unit/scripts/public-api-strand-noun.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#330](https://github.com/git-stunts/git-warp/issues/330) | Static text assertions in `test/unit/scripts/query-builder-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#331](https://github.com/git-stunts/git-warp/issues/331) | Static text assertions in `test/unit/scripts/query-controller-capability-seam.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#332](https://github.com/git-stunts/git-warp/issues/332) | Static text assertions in `test/conformance/queryReadModelSeam.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#333](https://github.com/git-stunts/git-warp/issues/333) | Static text assertions in `test/unit/scripts/read-api-doc-consistency.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#334](https://github.com/git-stunts/git-warp/issues/334) | Static text assertions in `test/unit/scripts/release-policy-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#335](https://github.com/git-stunts/git-warp/issues/335) | Static text assertions in `test/unit/scripts/remaining-big-files-closeout-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#336](https://github.com/git-stunts/git-warp/issues/336) | Static text assertions in `test/unit/scripts/runtime-controller-host-types.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#337](https://github.com/git-stunts/git-warp/issues/337) | Static text assertions in `test/unit/scripts/runtime-helper-wrapper-seams.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#338](https://github.com/git-stunts/git-warp/issues/338) | Static text assertions in `test/unit/scripts/runtime-host-product-seam.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#339](https://github.com/git-stunts/git-warp/issues/339) | Static text assertions in `test/unit/scripts/runtime-wiring-surface-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#340](https://github.com/git-stunts/git-warp/issues/340) | Static text assertions in `test/conformance/sludgeAtlas.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#341](https://github.com/git-stunts/git-warp/issues/341) | Static text assertions in `test/conformance/snapshotPropValueApiModel.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#342](https://github.com/git-stunts/git-warp/issues/342) | Static text assertions in `test/unit/scripts/streaming-memory-audit-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#345](https://github.com/git-stunts/git-warp/issues/345) | Static text assertions in `test/unit/scripts/uniform-git-cas-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#346](https://github.com/git-stunts/git-warp/issues/346) | Static text assertions in `test/conformance/v17CheckpointTailOpticReadBasis.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#347](https://github.com/git-stunts/git-warp/issues/347) | Static text assertions in `test/unit/scripts/v17-materialization-contract-docs.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#348](https://github.com/git-stunts/git-warp/issues/348) | Static text assertions in `test/unit/scripts/v17-migration-script-hygiene.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#349](https://github.com/git-stunts/git-warp/issues/349) | Static text assertions in `test/unit/scripts/v17-public-reading-surface.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#350](https://github.com/git-stunts/git-warp/issues/350) | Static text assertions in `test/unit/scripts/v17-worldline-reading-surface.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#351](https://github.com/git-stunts/git-warp/issues/351) | Static text assertions in `test/unit/v7-guards.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#352](https://github.com/git-stunts/git-warp/issues/352) | Static text assertions in `test/unit/scripts/warp-drift-crosslinks-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#353](https://github.com/git-stunts/git-warp/issues/353) | Static text assertions in `test/unit/scripts/warp-drift-release-slotting-shape.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#354](https://github.com/git-stunts/git-warp/issues/354) | Static text assertions in `test/unit/scripts/warpapp-capability-bridge.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#355](https://github.com/git-stunts/git-warp/issues/355) | Static text assertions in `test/unit/scripts/warpcore-runtime-bridge.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#356](https://github.com/git-stunts/git-warp/issues/356) | Static text assertions in `test/unit/scripts/warpgraph-capability-seam.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#357](https://github.com/git-stunts/git-warp/issues/357) | Static text assertions in `test/unit/scripts/warpgraph-factory-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#358](https://github.com/git-stunts/git-warp/issues/358) | Static text assertions in `test/unit/scripts/warpgraph-runtime-bridge-closeout.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#359](https://github.com/git-stunts/git-warp/issues/359) | Static text assertions in `test/unit/helpers/warpGraphTestUtilsStructure.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#360](https://github.com/git-stunts/git-warp/issues/360) | Static text assertions in `test/unit/scripts/warpruntime-helper-migration.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#361](https://github.com/git-stunts/git-warp/issues/361) | Static text assertions in `test/unit/scripts/warpruntime-suite-migration.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#362](https://github.com/git-stunts/git-warp/issues/362) | Static text assertions in `test/unit/scripts/worldline-detached-factory-seam.test.ts` | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#363](https://github.com/git-stunts/git-warp/issues/363) | SyncController tests mock 3 modules — test only proves wiring | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#366](https://github.com/git-stunts/git-warp/issues/366) | 20+ test files create incomplete persistence mocks | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#373](https://github.com/git-stunts/git-warp/issues/373) | VisibleStateComparisonV5 (808 LOC) and VisibleStateTransferPlannerV5 (692 LOC) have zero tests | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#390](https://github.com/git-stunts/git-warp/issues/390) | Source-change guard for doc-only cycles | Open | enhancement | cool-ideas | testing-quality | v18.0.0 | idea |
| [#391](https://github.com/git-stunts/git-warp/issues/391) | NO GODS CI Report | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#393](https://github.com/git-stunts/git-warp/issues/393) | Precommit Sludge Guillotine | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#397](https://github.com/git-stunts/git-warp/issues/397) | Sludge Score Dashboard | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#398](https://github.com/git-stunts/git-warp/issues/398) | Sludge Striker End-of-Turn Protocol | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#404](https://github.com/git-stunts/git-warp/issues/404) | Agent ratchet telemetry — per-commit snapshot of tsc/lint/tests | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#405](https://github.com/git-stunts/git-warp/issues/405) | Auto-generate the SSTS scorecard from git diff | Open | enhancement | cool-ideas | testing-quality | - | idea |

### v18.0.4 - Residual Test And Completion Scanner Cleanup

Close the leftover v18 patch-train testing issues and completion-scanner ideas after the larger harness waves have landed.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#411](https://github.com/git-stunts/git-warp/issues/411) | CLAUDESPEED session handoff protocol | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#415](https://github.com/git-stunts/git-warp/issues/415) | Cross-path equivalence as a general testing pattern | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#420](https://github.com/git-stunts/git-warp/issues/420) | ESLint rule: `throw new Error(...)` is banned; require domain error subclass | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#422](https://github.com/git-stunts/git-warp/issues/422) | Golden Blob Museum | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#424](https://github.com/git-stunts/git-warp/issues/424) | Hex Tripwire Test | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#426](https://github.com/git-stunts/git-warp/issues/426) | Convert 29 remaining JS test helper files to TypeScript | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#427](https://github.com/git-stunts/git-warp/issues/427) | MockPersistenceFactory — typed, complete, safe | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#429](https://github.com/git-stunts/git-warp/issues/429) | Ban conditional early returns in test bodies | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#436](https://github.com/git-stunts/git-warp/issues/436) | Automated SSJS scorecard in pre-commit hook | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#437](https://github.com/git-stunts/git-warp/issues/437) | SSTS Conformance Suite | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#439](https://github.com/git-stunts/git-warp/issues/439) | ESLint rule for vacuous test assertions | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#440](https://github.com/git-stunts/git-warp/issues/440) | Test oracle invariants — assert what MUST be true, not what IS true | Open | enhancement | cool-ideas | testing-quality | - | idea |
| [#505](https://github.com/git-stunts/git-warp/issues/505) | TSC Campaign Agent-Authored Code Audit | Open | enhancement | up-next | testing-quality | - | - |
| [#529](https://github.com/git-stunts/git-warp/issues/529) | Memory-bounded stream witnesses | Blocked | enhancement | up-next | testing-quality | - | blocked |
| [#580](https://github.com/git-stunts/git-warp/issues/580) | Consolidate static-text assertion cleanup campaign | Open | maintenance | bad-code | testing-quality | - | bad-code |

### v18.1.0 - API Capability And Public Surface Paydown

Pay down API capability, public-surface, command, and materializing-API removal work after the v18.0 public line is honest.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#123](https://github.com/git-stunts/git-warp/issues/123) | Public API Catalog And Browser Documentation Playground | Open | enhancement | backlog-root | api-capabilities | - | - |
| [#134](https://github.com/git-stunts/git-warp/issues/134) | WarpGraph Invisible API Surface Docs | Open | enhancement | backlog-root | api-capabilities | - | - |
| [#159](https://github.com/git-stunts/git-warp/issues/159) | openWarpGraph() uses 9 `as unknown as` casts at trust boundary | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#179](https://github.com/git-stunts/git-warp/issues/179) | HTTP sync server has no graceful shutdown | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#194](https://github.com/git-stunts/git-warp/issues/194) | `lwwMax` returns `LWWRegister&lt;T&gt; \| null` — awkward null in the happy path | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#223](https://github.com/git-stunts/git-warp/issues/223) | CC_joinreducer-coupling-hotspot | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#230](https://github.com/git-stunts/git-warp/issues/230) | CC_patchbuilder-churn-risk | Open | maintenance | bad-code | api-capabilities | v18.0.0 | bad-code |
| [#247](https://github.com/git-stunts/git-warp/issues/247) | GraphPersistencePort drops ConfigPort capability and forces side channels | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#248](https://github.com/git-stunts/git-warp/issues/248) | `_materializeGraph()` survives the v17 reading contract | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#249](https://github.com/git-stunts/git-warp/issues/249) | HookInstaller uses an ad hoc git config callback instead of a typed port | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#251](https://github.com/git-stunts/git-warp/issues/251) | `_runtime` exposed on public WarpGraph interface | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#260](https://github.com/git-stunts/git-warp/issues/260) | Consumer typecheck still expects public materialization | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#272](https://github.com/git-stunts/git-warp/issues/272) | PROTO_inmemory-graph-adapter-default-hash-unavailable-branch | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#276](https://github.com/git-stunts/git-warp/issues/276) | QueryBuilder tests exist but still carry legacy scaffolding sludge | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#280](https://github.com/git-stunts/git-warp/issues/280) | PROTO_state-diff-private-helper-residue | Open | maintenance | bad-code | api-capabilities | v18.0.0 | bad-code |
| [#369](https://github.com/git-stunts/git-warp/issues/369) | CC_untested-controllers | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#372](https://github.com/git-stunts/git-warp/issues/372) | Codebase has a pattern of vacuous assertions | Open | maintenance | bad-code | api-capabilities | v17.0.0 | bad-code |
| [#414](https://github.com/git-stunts/git-warp/issues/414) | Controller test harness — mock host with typed capability surface | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#425](https://github.com/git-stunts/git-warp/issues/425) | CI gate that audits all invariants on every PR | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#433](https://github.com/git-stunts/git-warp/issues/433) | requireCapabilities as a universal adapter wiring pattern | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#441](https://github.com/git-stunts/git-warp/issues/441) | `touched-files-status` — one command to show every file changed on a branch | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#448](https://github.com/git-stunts/git-warp/issues/448) | Runtime capability assertion in openWarpGraph() | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#453](https://github.com/git-stunts/git-warp/issues/453) | Lazy adapter construction for cold-start optimization | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#463](https://github.com/git-stunts/git-warp/issues/463) | Capability-based security via TypeScript narrowing | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#464](https://github.com/git-stunts/git-warp/issues/464) | Capability ports as a first-class protocol | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#468](https://github.com/git-stunts/git-warp/issues/468) | Align BTR shells with Continuum receipt families | Open | enhancement | cool-ideas | protocol-alignment | v18.0.0 | idea |
| [#473](https://github.com/git-stunts/git-warp/issues/473) | Materialization-free provenance readings | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#475](https://github.com/git-stunts/git-warp/issues/475) | Plan → Validate → Execute → Observe pipeline | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#483](https://github.com/git-stunts/git-warp/issues/483) | WarpRuntime.open() as a Builder pattern | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#485](https://github.com/git-stunts/git-warp/issues/485) | Writer-isolated bisect mode | Open | enhancement | cool-ideas | api-capabilities | - | idea |
| [#504](https://github.com/git-stunts/git-warp/issues/504) | Fill the remaining CLI command gaps | Open | enhancement | up-next | api-capabilities | - | - |
| [#509](https://github.com/git-stunts/git-warp/issues/509) | Break up the `index.d.ts` monolith | Open | enhancement | up-next | api-capabilities | - | - |
| [#512](https://github.com/git-stunts/git-warp/issues/512) | DX: Document Plumbing → GitPlumbing rename as breaking change | Open | enhancement | up-next | api-capabilities | - | - |
| [#533](https://github.com/git-stunts/git-warp/issues/533) | Typed capability interfaces per controller | Open | enhancement | up-next | api-capabilities | - | - |
| [#538](https://github.com/git-stunts/git-warp/issues/538) | Patch Commit Visibility Contract | Open | enhancement | up-next | api-capabilities | - | - |
| [#613](https://github.com/git-stunts/git-warp/issues/613) | Remove graph-wide materializing APIs from the v18 public surface | Open | maintenance | bad-code | api-capabilities | v18.0.0 | bad-code |

### v18.1.1 - Runtime Boundary And Wire-Format Paydown

Turn runtime boundary, wire-format, port, policy, and serialization contracts into explicit runtime-backed surfaces.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#131](https://github.com/git-stunts/git-warp/issues/131) | `typedCustom()` Zod Helper | Open | enhancement | backlog-root | runtime-boundaries | - | - |
| [#146](https://github.com/git-stunts/git-warp/issues/146) | Decide whether policy is an architecture layer | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#150](https://github.com/git-stunts/git-warp/issues/150) | HttpRequest/HttpResponse are typedef-only port boundary types | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#151](https://github.com/git-stunts/git-warp/issues/151) | LoggerObservabilityBridge has no constructor validation | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#170](https://github.com/git-stunts/git-warp/issues/170) | Domain message codec wrappers re-export infrastructure adapter code | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#191](https://github.com/git-stunts/git-warp/issues/191) | GCPolicy and related types are typedef-only | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#204](https://github.com/git-stunts/git-warp/issues/204) | Promote StateDiffResult from @typedef to class | Open | maintenance | bad-code | runtime-boundaries | v18.0.0 | bad-code |
| [#208](https://github.com/git-stunts/git-warp/issues/208) | WriterError constructor has inverted parameter order | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#217](https://github.com/git-stunts/git-warp/issues/217) | PayloadTooLargeError defined in two files independently | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#232](https://github.com/git-stunts/git-warp/issues/232) | RuntimeHost is back over the source file size ceiling | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#239](https://github.com/git-stunts/git-warp/issues/239) | WarpRuntime's 10 Object.defineProperty blocks should be a shared helper | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#241](https://github.com/git-stunts/git-warp/issues/241) | CborCodec.js exports bare functions, class, and singleton | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#242](https://github.com/git-stunts/git-warp/issues/242) | CLI persistence shape leaks plumbing into application wiring | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#245](https://github.com/git-stunts/git-warp/issues/245) | EffectSinkPort.deliver() has union return type | Open | maintenance | bad-code | runtime-boundaries | v17.0.0 | bad-code |
| [#253](https://github.com/git-stunts/git-warp/issues/253) | Guard BTR wire DTO locality | Open | maintenance | bad-code | btr-provenance-boundary | v18.0.0 | bad-code |
| [#380](https://github.com/git-stunts/git-warp/issues/380) | Deno runtime smoke tests must disable timer sanitizers | Open | maintenance | bad-code | runtime-boundaries | v18.0.0 | bad-code |
| [#396](https://github.com/git-stunts/git-warp/issues/396) | RuntimeHost Dependency Map | Open | enhancement | cool-ideas | runtime-boundaries | - | idea |
| [#399](https://github.com/git-stunts/git-warp/issues/399) | Canonical byte nouns for hash and signature boundaries | Open | enhancement | cool-ideas | runtime-boundaries | v18.0.0 | idea |
| [#445](https://github.com/git-stunts/git-warp/issues/445) | Error code registry as importable constants | Open | enhancement | cool-ideas | runtime-boundaries | - | idea |
| [#452](https://github.com/git-stunts/git-warp/issues/452) | Switch encrypted stores to fixed chunking | Open | enhancement | cool-ideas | runtime-boundaries | - | idea |
| [#480](https://github.com/git-stunts/git-warp/issues/480) | Typed codec port pattern — domain never touches raw bytes for serde | Open | enhancement | cool-ideas | runtime-boundaries | - | idea |
| [#507](https://github.com/git-stunts/git-warp/issues/507) | Enforce Max File Size + One-Thing-Per-File Policy | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#513](https://github.com/git-stunts/git-warp/issues/513) | `@git-stunts/trailer-codec` Type Declarations | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#518](https://github.com/git-stunts/git-warp/issues/518) | Vault-backed git-cas encryption for graph content | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#520](https://github.com/git-stunts/git-warp/issues/520) | Policy-as-a-port for retries, timeouts, and streams | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#521](https://github.com/git-stunts/git-warp/issues/521) | Make the substrate upgrader the compatibility boundary | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#523](https://github.com/git-stunts/git-warp/issues/523) | Dissolve serialization from domain (P5) | Blocked | enhancement | up-next | runtime-boundaries | - | blocked |
| [#524](https://github.com/git-stunts/git-warp/issues/524) | Delete VersionVector and ORSet backward-compat shims | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#532](https://github.com/git-stunts/git-warp/issues/532) | CBOR decode boundary: hydrate ops into class instances | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#534](https://github.com/git-stunts/git-warp/issues/534) | Drop `V5` runtime nouns | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#537](https://github.com/git-stunts/git-warp/issues/537) | Migrate op consumers to instanceof dispatch | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#541](https://github.com/git-stunts/git-warp/issues/541) | Cohesive WarpKernelPort (Persistence Union Type Cleanup) | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#542](https://github.com/git-stunts/git-warp/issues/542) | PROTO: WarpRuntime.open() options → WarpOpenOptions class | Open | enhancement | up-next | runtime-boundaries | - | - |
| [#543](https://github.com/git-stunts/git-warp/issues/543) | Persisted Wire-Format Migration (ADR 2) — EdgePropSet | Open | enhancement | up-next | runtime-boundaries | - | - |

### v18.1.2 - Trie, State Storage, And Optic Residuals

Finish trie/state-storage residue and the v17 checkpoint-tail optic carry-forward without overloading the API or boundary waves.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#137](https://github.com/git-stunts/git-warp/issues/137) | Recursive tree path edge-case benchmark | Open | enhancement | backlog-root | trie-state-storage | - | - |
| [#149](https://github.com/git-stunts/git-warp/issues/149) | Checkpoint schema support contract has drifted | Open | maintenance | bad-code | trie-state-storage | v17.0.0 | bad-code |
| [#153](https://github.com/git-stunts/git-warp/issues/153) | Path-keyed object accumulators at Git boundaries | Open | maintenance | bad-code | trie-state-storage | v18.0.0 | bad-code |
| [#161](https://github.com/git-stunts/git-warp/issues/161) | PROTO_roaring-loader-fallback-opacity | Open | maintenance | bad-code | trie-state-storage | v17.0.0 | bad-code |
| [#171](https://github.com/git-stunts/git-warp/issues/171) | Adapter and native bindings living in src/domain/utils/ | Open | maintenance | bad-code | trie-state-storage | v17.0.0 | bad-code |
| [#192](https://github.com/git-stunts/git-warp/issues/192) | IncrementalIndexUpdater leans on `Record&lt;string, unknown&gt;` and a duck-typed `WarpStateLike` | Open | maintenance | bad-code | trie-state-storage | v17.0.0 | bad-code |
| [#197](https://github.com/git-stunts/git-warp/issues/197) | PatchDiff class has no validation and typedef-only entries | Open | maintenance | bad-code | trie-state-storage | v18.0.0 | bad-code |
| [#199](https://github.com/git-stunts/git-warp/issues/199) | removeNode/removeEdge on a non-existent entity silently produces no-op | Open | maintenance | bad-code | trie-state-storage | v18.0.0 | bad-code |
| [#254](https://github.com/git-stunts/git-warp/issues/254) | Split CheckpointTailWitnessLocator before it becomes sludge | Open | maintenance | bad-code | v17-optics-checkpoint-tail | v17.0.0 | bad-code |
| [#379](https://github.com/git-stunts/git-warp/issues/379) | CborCheckpointStoreAdapter owns general CRDT serialization | Open | maintenance | bad-code | trie-state-storage | v17.0.0 | bad-code |
| [#389](https://github.com/git-stunts/git-warp/issues/389) | Trie geometry profile exposed contract drift and a 1M scan-count regression | Open | maintenance | bad-code | trie-state-storage | v17.0.0 | bad-code |
| [#406](https://github.com/git-stunts/git-warp/issues/406) | User-Supplied Resilience Policies via Alfred | Open | enhancement | cool-ideas | trie-state-storage | - | idea |
| [#428](https://github.com/git-stunts/git-warp/issues/428) | Mutation testing to find tests that bless bugs | Open | enhancement | cool-ideas | trie-state-storage | - | idea |
| [#449](https://github.com/git-stunts/git-warp/issues/449) | Sub-path exports to reduce default bundle size | Open | enhancement | cool-ideas | trie-state-storage | - | idea |
| [#455](https://github.com/git-stunts/git-warp/issues/455) | Native vs WASM Roaring Benchmark Pack | Open | enhancement | cool-ideas | trie-state-storage | - | idea |
| [#478](https://github.com/git-stunts/git-warp/issues/478) | Safe path-map materialization pattern | Open | enhancement | cool-ideas | trie-state-storage | - | idea |

### v18.2.0 - Tooling, Docs, And Package Surface

Tighten command coverage, issue triage, public docs automation, and package-surface hygiene without expanding the runtime ontology.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#238](https://github.com/git-stunts/git-warp/issues/238) | git-stunts ecosystem packages are underused | Open | maintenance | bad-code | testing-quality | v17.0.0 | bad-code |
| [#412](https://github.com/git-stunts/git-warp/issues/412) | Expand CLI_GUIDE.md with complete command reference | Open | enhancement | cool-ideas | docs-dx | - | idea |
| [#506](https://github.com/git-stunts/git-warp/issues/506) | Audit dependency hygiene: tar override, zod pin, patch-package | Open | enhancement | up-next | tooling-release | - | - |
| [#601](https://github.com/git-stunts/git-warp/issues/601) | COOL IDEA: repository inventory witness command | Open | enhancement | cool-ideas | tooling-release | - | idea |
| [#619](https://github.com/git-stunts/git-warp/issues/619) | Generate an issue triage report for bad-code batch planning | Open | enhancement | cool-ideas | tooling-release | v18.0.0 | idea |

### v19.0.0 - Observer Admission Runtime

Make observer doctrine runtime-real beyond the v18 bounded public-path gate: observer-readable receipts, support rules, plans, envelopes, fragments, and witnessed suffix shells.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#152](https://github.com/git-stunts/git-warp/issues/152) | PatchSession classifies errors by parsing err.message | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#154](https://github.com/git-stunts/git-warp/issues/154) | TrustRecordSchema superRefine mutates record during validation | Open | maintenance | bad-code | merge-strands-worldlines | v19.0.0 | bad-code |
| [#166](https://github.com/git-stunts/git-warp/issues/166) | BoundaryTransitionRecord and AuditService use ambient wall-clock | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#181](https://github.com/git-stunts/git-warp/issues/181) | 5 eslint-disable suppressions bypass the wall-clock ban in domain | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#183](https://github.com/git-stunts/git-warp/issues/183) | WarpServeService domain/infra boundary blur | Open | maintenance | bad-code | merge-strands-worldlines | v19.0.0 | bad-code |
| [#196](https://github.com/git-stunts/git-warp/issues/196) | Op wire POJOs and Op class instances flow through the same pipeline | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#222](https://github.com/git-stunts/git-warp/issues/222) | PROTO_join-reducer-import-time-strategy-validation-residue | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#234](https://github.com/git-stunts/git-warp/issues/234) | sortedReplacer and validation helpers duplicated across 3 files | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#237](https://github.com/git-stunts/git-warp/issues/237) | PROTO_trust-record-service-unreachable-exhausted-tails | Open | maintenance | bad-code | merge-strands-worldlines | v19.0.0 | bad-code |
| [#256](https://github.com/git-stunts/git-warp/issues/256) | WarpGraph.audit.test.js has vacuous tests with conditional early returns | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#261](https://github.com/git-stunts/git-warp/issues/261) | Coverage ratchet baseline dropped during v17 release preflight | Open | maintenance | bad-code | tooling-release | v19.0.0 | bad-code |
| [#384](https://github.com/git-stunts/git-warp/issues/384) | Live-tail bounded query/checksum substrate is missing | Blocked | maintenance | bad-code | observer-admission-runtime | v18.0.0 | blocked, bad-code |
| [#385](https://github.com/git-stunts/git-warp/issues/385) | Domain types own their own serialization (P5 violation) | Open | maintenance | bad-code | observer-admission-runtime | v19.0.0 | bad-code |
| [#410](https://github.com/git-stunts/git-warp/issues/410) | Self-healing CLAUDE.md — generated from codebase truth | Open | enhancement | cool-ideas | observer-admission-runtime | - | idea |
| [#431](https://github.com/git-stunts/git-warp/issues/431) | satisfies-based port validation for plain-object adapters | Open | enhancement | cool-ideas | observer-admission-runtime | - | idea |
| [#474](https://github.com/git-stunts/git-warp/issues/474) | ORSet.compact() returns CompactionReceipt | Open | enhancement | cool-ideas | observer-admission-runtime | - | idea |
| [#484](https://github.com/git-stunts/git-warp/issues/484) | First-class Witness type | Open | enhancement | cool-ideas | observer-admission-runtime | - | idea |
| [#511](https://github.com/git-stunts/git-warp/issues/511) | Guide: Observer-First Client Pattern | Blocked | enhancement | up-next | observer-admission-runtime | - | blocked |
| [#525](https://github.com/git-stunts/git-warp/issues/525) | Grow Observer toward full structural observer | Open | enhancement | up-next | observer-admission-runtime | - | - |
| [#554](https://github.com/git-stunts/git-warp/issues/554) | Make receipts observer-readable or replace them with observer-readable truth | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#555](https://github.com/git-stunts/git-warp/issues/555) | Docs/runtime convergence ratchet | Open | enhancement | release, v19.0.0 | observer-admission-runtime | - | release |
| [#556](https://github.com/git-stunts/git-warp/issues/556) | Keep WARP doctrine and shipped runtime teaching aligned | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#557](https://github.com/git-stunts/git-warp/issues/557) | WESLEY Receipt Envelope Boundary | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#558](https://github.com/git-stunts/git-warp/issues/558) | Bounded support rules for query surfaces | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#559](https://github.com/git-stunts/git-warp/issues/559) | Causal indexes for sliced queries | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#560](https://github.com/git-stunts/git-warp/issues/560) | Live holographic strands | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#561](https://github.com/git-stunts/git-warp/issues/561) | Observer plans and reading envelopes | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#562](https://github.com/git-stunts/git-warp/issues/562) | Support-scoped fragment materialization | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#563](https://github.com/git-stunts/git-warp/issues/563) | Tick-range graph diff API | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |
| [#564](https://github.com/git-stunts/git-warp/issues/564) | Witnessed suffix admission shells | Blocked | enhancement | release, v19.0.0 | observer-admission-runtime | - | blocked, release |

### v19.1.0 - Sync, Trust, And Protocol Security

Advance trust/security contracts, sync authentication, protocol alignment, and policy surfaces once observer boundaries are stable enough to protect.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#129](https://github.com/git-stunts/git-warp/issues/129) | Docs: SECURITY_SYNC.md | Open | enhancement | backlog-root | sync-trust-security | - | - |
| [#138](https://github.com/git-stunts/git-warp/issues/138) | `TrustKeyStore` Pre-Validated Key Cache | Open | enhancement | backlog-root | sync-trust-security | - | - |
| [#139](https://github.com/git-stunts/git-warp/issues/139) | Doctor: Property-Based Fuzz Test | Open | enhancement | backlog-root | sync-trust-security | - | - |
| [#140](https://github.com/git-stunts/git-warp/issues/140) | Trust Record Round-Trip Snapshot Test | Open | enhancement | backlog-root | sync-trust-security | - | - |
| [#141](https://github.com/git-stunts/git-warp/issues/141) | Trust Schema Discriminated Union | Open | enhancement | backlog-root | sync-trust-security | - | - |
| [#142](https://github.com/git-stunts/git-warp/issues/142) | `unsignedRecordForId` Edge-Case Tests | Open | enhancement | backlog-root | sync-trust-security | - | - |
| [#147](https://github.com/git-stunts/git-warp/issues/147) | CBOR deserialization has no depth or size limits | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#167](https://github.com/git-stunts/git-warp/issues/167) | CLI hook installer bypasses ports with raw git subprocesses | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#168](https://github.com/git-stunts/git-warp/issues/168) | TrustCanonical.js imports defaultCrypto (node:crypto in domain) | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#169](https://github.com/git-stunts/git-warp/issues/169) | defaultCodec/defaultCrypto/defaultTrustCrypto import infrastructure in domain | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#175](https://github.com/git-stunts/git-warp/issues/175) | Repo maintenance scripts still shell out to raw git instead of plumbing | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#176](https://github.com/git-stunts/git-warp/issues/176) | Sync endpoint has no rate limiting | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#177](https://github.com/git-stunts/git-warp/issues/177) | Sync response paging and metrics are still coarse | Open | maintenance | bad-code | sync-trust-security | v19.0.0 | bad-code |
| [#178](https://github.com/git-stunts/git-warp/issues/178) | Sync auth HMAC secrets passed as plain strings through domain | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#180](https://github.com/git-stunts/git-warp/issues/180) | SyncAuthService uses crypto.randomUUID for HMAC nonce | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#184](https://github.com/git-stunts/git-warp/issues/184) | WriterId.js uses crypto.getRandomValues in domain | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#206](https://github.com/git-stunts/git-warp/issues/206) | EventId defined as both typedef and class | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#209](https://github.com/git-stunts/git-warp/issues/209) | Always-true null/undefined checks on non-nullable values | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#235](https://github.com/git-stunts/git-warp/issues/235) | TrustEvaluator couples to TrustStateBuilder key encoding | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#236](https://github.com/git-stunts/git-warp/issues/236) | TrustRecordService has multiple code smells | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#243](https://github.com/git-stunts/git-warp/issues/243) | CommitPort has 10 methods mixing 4 concerns | Open | maintenance | bad-code | sync-trust-security | v17.0.0 | bad-code |
| [#418](https://github.com/git-stunts/git-warp/issues/418) | Full discriminated unions for RawOpV2 / CanonicalOpV2 with typed fields | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#430](https://github.com/git-stunts/git-warp/issues/430) | Op hydration at the CBOR decode boundary | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#447](https://github.com/git-stunts/git-warp/issues/447) | Opaque SyncSecret type with redaction protection | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#454](https://github.com/git-stunts/git-warp/issues/454) | Materialization budget — O(P) with a ceiling | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#457](https://github.com/git-stunts/git-warp/issues/457) | Streaming GraphTraversal — async generators | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#470](https://github.com/git-stunts/git-warp/issues/470) | Rename `encrypted` trailer to `eg-encrypted` | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#476](https://github.com/git-stunts/git-warp/issues/476) | Safe CBOR decoder with depth/size/allocation limits | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#488](https://github.com/git-stunts/git-warp/issues/488) | Per-writer key envelope encryption (KEK wrapping) | Open | enhancement | cool-ideas | sync-trust-security | - | idea |
| [#544](https://github.com/git-stunts/git-warp/issues/544) | Sync Auth: Migrate from Symmetric HMAC to Ed25519 Asymmetric Signatures | Open | enhancement | up-next | sync-trust-security | - | - |

### v19.2.0 - Workspace And Integration Boundaries

Package extraction, multi-package release, MCP, and integration architecture that should follow the v19 observer model rather than constrain it prematurely.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#500](https://github.com/git-stunts/git-warp/issues/500) | METHOD MCP workspace detection drift | Open | enhancement | inbox | - | - | - |
| [#515](https://github.com/git-stunts/git-warp/issues/515) | Extract warp-adapters as a real published workspace package | Blocked | enhancement | up-next | runtime-boundaries | - | blocked |
| [#516](https://github.com/git-stunts/git-warp/issues/516) | Extract warp-kernel as a real published workspace package | Blocked | enhancement | up-next | runtime-boundaries | - | blocked |
| [#517](https://github.com/git-stunts/git-warp/issues/517) | Extract warp-orset as a real published workspace package | Blocked | enhancement | up-next | trie-state-storage | - | blocked |
| [#519](https://github.com/git-stunts/git-warp/issues/519) | Design and implement the multi-package release pipeline | Blocked | enhancement | up-next | tooling-release | - | blocked |
| [#522](https://github.com/git-stunts/git-warp/issues/522) | Add a git-warp MCP server | Open | enhancement | up-next | api-capabilities | - | - |

### v20.0.0 - Streaming Read/Write Execution

Make slice-first, bounded, streaming read/write execution ordinary runtime behavior rather than special-case gate evidence.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#136](https://github.com/git-stunts/git-warp/issues/136) | Out-of-core materialization and streaming reads | Blocked | enhancement | backlog-root | materialization-query-index | - | blocked |
| [#189](https://github.com/git-stunts/git-warp/issues/189) | ORSet and LWW have no constructor validation | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#190](https://github.com/git-stunts/git-warp/issues/190) | Frontier is a typedef alias for Map with 9 free functions | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#205](https://github.com/git-stunts/git-warp/issues/205) | VersionVector constructor accepts undefined entries | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#212](https://github.com/git-stunts/git-warp/issues/212) | ComparisonController contains 4 shadow selector classes | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#220](https://github.com/git-stunts/git-warp/issues/220) | GraphTraversal.js has 11 algorithms in 1617 LOC | Open | maintenance | bad-code | testing-quality | v20.0.0 | bad-code |
| [#225](https://github.com/git-stunts/git-warp/issues/225) | LogicalTraversal is a deprecated facade with a broad materialization seam | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#226](https://github.com/git-stunts/git-warp/issues/226) | MaterializeController is a god object (~1009 LOC) | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#262](https://github.com/git-stunts/git-warp/issues/262) | DagPathFinding.js (705 LOC) has zero tests and 5 functions &gt;50 LOC | Open | maintenance | bad-code | testing-quality | v20.0.0 | bad-code |
| [#274](https://github.com/git-stunts/git-warp/issues/274) | No observability for CRDT conflict resolution rates | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#375](https://github.com/git-stunts/git-warp/issues/375) | BitmapIndexBuilder/Reader/Streaming always change together (22x in 3 months) | Open | maintenance | bad-code | materialization-query-index | v20.0.0 | bad-code |
| [#386](https://github.com/git-stunts/git-warp/issues/386) | QueryBuilder match() does a full node scan | Open | maintenance | bad-code | observer-admission-runtime | v20.0.0 | bad-code |
| [#387](https://github.com/git-stunts/git-warp/issues/387) | PROTO_streaming-bitmap-index-builder-serialization-tail | Open | maintenance | bad-code | merge-strands-worldlines | v20.0.0 | bad-code |
| [#458](https://github.com/git-stunts/git-warp/issues/458) | Streaming materialization with progressive state | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#530](https://github.com/git-stunts/git-warp/issues/530) | Migrate read paths + unbounded scans to streams | Blocked | enhancement | up-next | materialization-query-index | - | blocked |
| [#565](https://github.com/git-stunts/git-warp/issues/565) | End-To-End Graph Streaming Reads And Writes | Blocked | enhancement | release, v20.0.0 | materialization-query-index | - | blocked, release |
| [#566](https://github.com/git-stunts/git-warp/issues/566) | Align Playback-Head And TTD Consumers After Read Nouns Stabilize | Blocked | enhancement | release, v20.0.0 | merge-strands-worldlines | - | blocked, release |
| [#567](https://github.com/git-stunts/git-warp/issues/567) | Strand Collapse Optic For Causal Slicing | Blocked | enhancement | release, v20.0.0 | merge-strands-worldlines | - | blocked, release |
| [#646](https://github.com/git-stunts/git-warp/issues/646) | Retire legacy content attachment storage-plane boundaries | Open | enhancement | up-next | graph-model-substrate | v20.0.0 | - |

### v20.1.0 - Materialization, Index, And Diagnostic Model

Reshape indexes, materialization controllers, async traversal, and diagnostics around bounded support instead of full-state residency.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#174](https://github.com/git-stunts/git-warp/issues/174) | runtimeHelpers imports infrastructure adapters and branches on plumbing presence | Open | maintenance | bad-code | materialization-query-index | v17.0.0 | bad-code |
| [#182](https://github.com/git-stunts/git-warp/issues/182) | WarpRuntime.open constructs infrastructure adapters by peeking at plumbing | Open | maintenance | bad-code | materialization-query-index | v17.0.0 | bad-code |
| [#185](https://github.com/git-stunts/git-warp/issues/185) | PropertyIndexReader impersonates a larger storage port | Blocked | maintenance | bad-code | materialized-index | v17.0.0 | blocked, bad-code |
| [#186](https://github.com/git-stunts/git-warp/issues/186) | Materialization snapshotting is off by default | Open | maintenance | bad-code | materialization-snapshotting | v17.0.0 | bad-code |
| [#188](https://github.com/git-stunts/git-warp/issues/188) | CoordinateFactExport has 11 typedef-only domain concepts | Open | maintenance | bad-code | materialization-query-index | v17.0.0 | bad-code |
| [#195](https://github.com/git-stunts/git-warp/issues/195) | NeighborEdge and Direction are typedef-only domain concepts | Open | maintenance | bad-code | materialization-query-index | v18.0.0 | bad-code |
| [#198](https://github.com/git-stunts/git-warp/issues/198) | PatchV2 class has zero constructor validation | Open | maintenance | bad-code | materialization-query-index | v18.0.0 | bad-code |
| [#210](https://github.com/git-stunts/git-warp/issues/210) | Subscriber type uses bare `Function` instead of typed callback | Open | maintenance | bad-code | materialization-query-index | v17.0.0 | bad-code |
| [#228](https://github.com/git-stunts/git-warp/issues/228) | MaterializedViewService carries index verification concern | Open | maintenance | bad-code | materialization-query-index | v20.0.0 | bad-code |
| [#229](https://github.com/git-stunts/git-warp/issues/229) | PatchBuilderV2 12-parameter constructor | Open | maintenance | bad-code | materialization-query-index | v18.0.0 | bad-code |
| [#250](https://github.com/git-stunts/git-warp/issues/250) | GraphPersistencePort uses Object.defineProperty breaking instanceof | Open | maintenance | bad-code | materialization-query-index | v17.0.0 | bad-code |
| [#383](https://github.com/git-stunts/git-warp/issues/383) | Legacy seek-cache key drops frontier | Open | maintenance | bad-code | materialization-query-index | v17.0.0 | bad-code |
| [#388](https://github.com/git-stunts/git-warp/issues/388) | topologicalSort always materializes full adjacency | Open | maintenance | bad-code | materialization-query-index | v20.0.0 | bad-code |
| [#392](https://github.com/git-stunts/git-warp/issues/392) | Observer Query Coordinate Language | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#394](https://github.com/git-stunts/git-warp/issues/394) | Query Cursor Fuzzer | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#395](https://github.com/git-stunts/git-warp/issues/395) | Query Hologram Explain Plan | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#435](https://github.com/git-stunts/git-warp/issues/435) | Serializer Exorcism Commit Series | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#451](https://github.com/git-stunts/git-warp/issues/451) | CI alert when change-coupling score increases | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#456](https://github.com/git-stunts/git-warp/issues/456) | Restore buffer guard for seek cache + blob adapter | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#472](https://github.com/git-stunts/git-warp/issues/472) | Incremental History Backfill for Git Mirror Use Cases | Open | enhancement | cool-ideas | materialization-query-index | - | idea |
| [#527](https://github.com/git-stunts/git-warp/issues/527) | Async Generator Traversal API | Blocked | enhancement | up-next | materialization-query-index | - | blocked |
| [#528](https://github.com/git-stunts/git-warp/issues/528) | Remove per-artifact ports + defaultCodec | Blocked | enhancement | up-next | materialization-query-index | - | blocked |
| [#535](https://github.com/git-stunts/git-warp/issues/535) | MaterializeController strategy decomposition | Open | enhancement | up-next | materialization-query-index | - | - |

### v21.0.0 - Merge/Strand/Worldline Runtime

Make distributed/plural admission semantics runtime-real: merge classifiers, braid collapse, local sites, and strand/worldline merge nouns.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#157](https://github.com/git-stunts/git-warp/issues/157) | callInternalRuntimeMethod is a runtime access-control escape hatch | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#162](https://github.com/git-stunts/git-warp/issues/162) | WarpState.prop carries `LWWRegister&lt;unknown&gt;` — the value type is a lie | Open | maintenance | bad-code | merge-strands-worldlines | v18.0.0 | bad-code |
| [#163](https://github.com/git-stunts/git-warp/issues/163) | Worldline double-casts itself to WarpRuntime in 3 places | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#164](https://github.com/git-stunts/git-warp/issues/164) | PROTO_wormhole-service-defensive-tail-branches | Open | maintenance | bad-code | merge-strands-worldlines | v21.0.0 | bad-code |
| [#200](https://github.com/git-stunts/git-warp/issues/200) | strandPublicShape.js is a complex identity transform | Open | maintenance | bad-code | merge-strands-worldlines | v21.0.0 | bad-code |
| [#201](https://github.com/git-stunts/git-warp/issues/201) | Strand model still lives as a typedef corridor across collaborator files | Open | maintenance | bad-code | merge-strands-worldlines | v21.0.0 | bad-code |
| [#207](https://github.com/git-stunts/git-warp/issues/207) | WormholeEdge is a typedef with external serialize behavior | Open | maintenance | bad-code | merge-strands-worldlines | v21.0.0 | bad-code |
| [#213](https://github.com/git-stunts/git-warp/issues/213) | ConflictAnalyzerService has dead and self-cancelling branches | Open | maintenance | bad-code | merge-strands-worldlines | v21.0.0 | bad-code |
| [#214](https://github.com/git-stunts/git-warp/issues/214) | ConflictAnalyzerService is a god object (2582 LOC) | Open | maintenance | bad-code | merge-strands-worldlines | v21.0.0 | bad-code |
| [#215](https://github.com/git-stunts/git-warp/issues/215) | CC_dead-exports-182 | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#216](https://github.com/git-stunts/git-warp/issues/216) | Detached graph openers duplicate and drift from WarpRuntime.open() | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#219](https://github.com/git-stunts/git-warp/issues/219) | exactOptionalPropertyTypes conditional spread boilerplate | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#240](https://github.com/git-stunts/git-warp/issues/240) | DRY up WarpRuntime delegation boilerplate | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#252](https://github.com/git-stunts/git-warp/issues/252) | Worldline reaches into 13+ WarpRuntime private fields | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#364](https://github.com/git-stunts/git-warp/issues/364) | 30 test files over 800 LOC — test gods | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#365](https://github.com/git-stunts/git-warp/issues/365) | Test helper overlap — consolidate fixture DSLs | Open | maintenance | bad-code | merge-strands-worldlines | v17.0.0 | bad-code |
| [#370](https://github.com/git-stunts/git-warp/issues/370) | CC_untested-strand-services | Open | maintenance | bad-code | merge-strands-worldlines | v21.0.0 | bad-code |
| [#416](https://github.com/git-stunts/git-warp/issues/416) | Dead code cemetery — automated detection | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#460](https://github.com/git-stunts/git-warp/issues/460) | Aperture-relative merge | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#461](https://github.com/git-stunts/git-warp/issues/461) | Braid — composite read presentation across lanes | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#465](https://github.com/git-stunts/git-warp/issues/465) | PROTO_change-coupling-breaker | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#467](https://github.com/git-stunts/git-warp/issues/467) | Conflict distance | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#471](https://github.com/git-stunts/git-warp/issues/471) | Frontier as a proper class — the last great typedef | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#481](https://github.com/git-stunts/git-warp/issues/481) | Unmerge as first-class | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#486](https://github.com/git-stunts/git-warp/issues/486) | Merge geometry open questions | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#489](https://github.com/git-stunts/git-warp/issues/489) | `git warp certify` — property certificates as CLI output | Open | enhancement | cool-ideas | merge-strands-worldlines | - | idea |
| [#503](https://github.com/git-stunts/git-warp/issues/503) | Conflict Pipeline God-Context | Open | enhancement | up-next | merge-strands-worldlines | - | - |
| [#508](https://github.com/git-stunts/git-warp/issues/508) | Merge conflict corpus and benchmark | Open | enhancement | up-next | merge-strands-worldlines | - | - |
| [#526](https://github.com/git-stunts/git-warp/issues/526) | Rename Worldline class to match theory | Blocked | enhancement | up-next | merge-strands-worldlines | - | blocked |
| [#536](https://github.com/git-stunts/git-warp/issues/536) | Merge classifier | Blocked | enhancement | up-next | merge-strands-worldlines | - | blocked |
| [#539](https://github.com/git-stunts/git-warp/issues/539) | Same-Writer Concurrent Patch Race Witness | Blocked | enhancement | up-next | merge-strands-worldlines | - | blocked |
| [#540](https://github.com/git-stunts/git-warp/issues/540) | TTD merge inspector | Blocked | enhancement | up-next | merge-strands-worldlines | - | blocked |
| [#568](https://github.com/git-stunts/git-warp/issues/568) | Local site object for neighborhoods | Blocked | enhancement | release, v21.0.0 | merge-strands-worldlines | - | blocked, release |
| [#569](https://github.com/git-stunts/git-warp/issues/569) | Merge runtime noun family | Blocked | enhancement | release, v21.0.0 | merge-strands-worldlines | - | blocked, release |
| [#570](https://github.com/git-stunts/git-warp/issues/570) | Implement collapseBraid() per runtime spec | Blocked | enhancement | release, v21.0.0 | merge-strands-worldlines | - | blocked, release |
| [#571](https://github.com/git-stunts/git-warp/issues/571) | Wesley merge contracts | Blocked | enhancement | release, v21.0.0 | merge-strands-worldlines | - | blocked, release |

### v21.1.0 - WESLEY/Continuum Merge Contracts

Stabilize WESLEY and Continuum contract surfaces after the merge runtime nouns are no longer speculative.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#531](https://github.com/git-stunts/git-warp/issues/531) | WESLEY lane / coordinate / capability boundary | Blocked | enhancement | up-next | merge-strands-worldlines | - | blocked |

### Future / Needs Triage

Issues without enough signal for a release slot. They stay visible here until labels or designs make a sharper call possible.

| Issue | Title | Status | Type | Lane | Feature | Release Home | Flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#499](https://github.com/git-stunts/git-warp/issues/499) | METHOD CLI tooling | Open | enhancement | inbox | - | - | - |
| [#501](https://github.com/git-stunts/git-warp/issues/501) | Upgrade METHOD.md to v2 draft | Open | enhancement | inbox | - | - | - |
| [#502](https://github.com/git-stunts/git-warp/issues/502) | Witness directory convention for playback | Open | enhancement | inbox | - | - | - |
| [#625](https://github.com/git-stunts/git-warp/issues/625) | Decide native vs translated continuum.debug.hello.v1 posture | Open | - | - | - | - | - |

## Reconciliation Check

| Check | Count |
| --- | ---: |
| Open issues pulled from GitHub | 407 |
| Issues assigned to roadmap tables | 407 |
| Largest release slot | 50 |
| Release slots over 50 issues | 0 |
| Unassigned gap | 0 |

## Maintenance Notes

- Regenerate this document after material issue-label changes, mass issue closure, or any release-scope decision.
- If an issue is done, close it in GitHub rather than silently removing it from this roadmap.
- If an issue belongs to a different release, relabel the GitHub issue first and then update this document.
- Keep every release bucket at or below 50 open issues; split first, then argue about priority.
