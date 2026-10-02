# v20.2.0 — Repeatable engineering and consumer evidence

Planning status: proposed delivery plan for the accepted [v20.2.0 milestone](https://github.com/git-stunts/git-warp/milestone/22) and matching milestone in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452). Owner: James Ross. No target date is assigned. [All release plans](../README.md).

Snapshot: 2026-10-01 Pacific; source baseline `94b40dac64034cd8caab9bb05efe14a0c22bd735`. Live issue homes/titles and recorded GitHub prerequisites were reconciled with Linear at `2026-10-02T04:24:27.613318+00:00`. Inventory: **78 cards** (10 must ship; 51 may slip; 14 discovery; 3 tracking). This describes intended capability, not current implementation or release readiness.

## Release proposition

Replace repeated manual checks and duplicated test scaffolding with one structural conformance producer, a diff scorecard/hook, catalog-backed executable documentation, and typed controller fixtures. Maintainers gain reproducible evidence while the public runtime remains compatible.

**Version boundary:** MINOR: additive tooling and supported engineering workflows; retain public runtime, CLI and storage contracts. Refactors must independently satisfy the repository coverage and architecture gates.

## Capability boundary

### Before this release

The v20 runtime and observation capabilities are the compatibility baseline. Maintainers still repeat structural checks, duplicate incomplete test hosts/persistence mocks, and maintain executable documentation without one authoritative topic/cost catalog. The milestone also contains a large candidate backlog; its size is not a commitment to land every cleanup.

### After this release

A shared structural conformance producer feeds a changed-file scorecard and hook. Typed, complete persistence and controller fixtures support a real SyncProtocol behavior test. A machine-readable topic catalog drives executable documentation and first-use cost guards. Each of these workflows produces reproducible evidence without changing supported runtime semantics.

### Still out of reach

This release does not certify absence of all regressions, automate every engineering judgment, eliminate all debt, extract public workspace packages, or require every optional dashboard before an ordinary fix can merge.

## Exit invariants

- [#437](https://github.com/git-stunts/git-warp/issues/437) owns structural conformance facts; [#405](https://github.com/git-stunts/git-warp/issues/405) consumes them and [#441](https://github.com/git-stunts/git-warp/issues/441)'s changed-file set; [#438](https://github.com/git-stunts/git-warp/issues/438) invokes the same scorecard rather than reimplementing policy.
- [#427](https://github.com/git-stunts/git-warp/issues/427) owns complete persistence fixtures; [#414](https://github.com/git-stunts/git-warp/issues/414) composes a typed controller host; [#363](https://github.com/git-stunts/git-warp/issues/363) exercises real protocol behavior rather than merely mocking its wiring.
- [#669](https://github.com/git-stunts/git-warp/issues/669) owns topic metadata; [#444](https://github.com/git-stunts/git-warp/issues/444) and [#578](https://github.com/git-stunts/git-warp/issues/578) derive execution/first-use checks from that shared source.
- Invalid fixtures and deliberately broken examples fail the gates. A report must distinguish a skipped/unavailable check from a pass.
- Each cleanup PR preserves a working intermediate mainline and current public runtime, CLI, storage, and type compatibility.
- Refactor slices meet the repository's touched-code coverage and architecture requirements. Test and benchmark execution remains inside COPY-based Docker.

## Scope

### Must ship

Ten cards define the release: [#437](https://github.com/git-stunts/git-warp/issues/437)/[#441](https://github.com/git-stunts/git-warp/issues/441)/[#405](https://github.com/git-stunts/git-warp/issues/405)/[#438](https://github.com/git-stunts/git-warp/issues/438) for structural evidence, [#427](https://github.com/git-stunts/git-warp/issues/427)/[#414](https://github.com/git-stunts/git-warp/issues/414)/[#363](https://github.com/git-stunts/git-warp/issues/363) for trustworthy controller/protocol fixtures, and [#669](https://github.com/git-stunts/git-warp/issues/669)/[#444](https://github.com/git-stunts/git-warp/issues/444)/[#578](https://github.com/git-stunts/git-warp/issues/578) for catalog-backed executable documentation. Their recorded prerequisites are included in this set.

### May slip

The 51 candidates cover contributor guidance, extra policy automation and dashboards, broader test conversion and mutation/oracle evidence, narrow runtime cleanup, and release tooling. Examples are [#391](https://github.com/git-stunts/git-warp/issues/391)/[#397](https://github.com/git-stunts/git-warp/issues/397) metrics, [#684](https://github.com/git-stunts/git-warp/issues/684)/[#415](https://github.com/git-stunts/git-warp/issues/415) cross-path witnesses, [#440](https://github.com/git-stunts/git-warp/issues/440) independent oracles, [#265](https://github.com/git-stunts/git-warp/issues/265)/[#445](https://github.com/git-stunts/git-warp/issues/445) error codes, and [#690](https://github.com/git-stunts/git-warp/issues/690)/[#691](https://github.com/git-stunts/git-warp/issues/691) release automation. None is a blanket gate on the ten committed outcomes. The categorized inventory is the complete candidate list.

### Discovery

The 14 discovery cards are [#121](https://github.com/git-stunts/git-warp/issues/121), [#130](https://github.com/git-stunts/git-warp/issues/130), [#161](https://github.com/git-stunts/git-warp/issues/161), [#167](https://github.com/git-stunts/git-warp/issues/167), [#193](https://github.com/git-stunts/git-warp/issues/193), [#200](https://github.com/git-stunts/git-warp/issues/200), [#215](https://github.com/git-stunts/git-warp/issues/215), [#216](https://github.com/git-stunts/git-warp/issues/216), [#249](https://github.com/git-stunts/git-warp/issues/249), [#365](https://github.com/git-stunts/git-warp/issues/365), [#371](https://github.com/git-stunts/git-warp/issues/371), [#423](https://github.com/git-stunts/git-warp/issues/423), [#426](https://github.com/git-stunts/git-warp/issues/426), and [#861](https://github.com/git-stunts/git-warp/issues/861). Reconcile stale paths/counts, already-landed behavior, and external-tool failures before selecting a PR.

[#193](https://github.com/git-stunts/git-warp/issues/193) must settle actual absent-owner/empty-observed-dot/concurrent-re-add semantics before candidate [#440](https://github.com/git-stunts/git-warp/issues/440) codifies an oracle. Its placement here is the accepted prerequisite promotion; an old assertion that all empty-dot removes are illegal is not an established invariant.

### Tracking

[#261](https://github.com/git-stunts/git-warp/issues/261) tracks coverage-baseline recovery, [#364](https://github.com/git-stunts/git-warp/issues/364) large test files, and [#580](https://github.com/git-stunts/git-warp/issues/580) static-text assertion cleanup. These three campaigns group independently executable work. They are not extra PRs and must be closed with evidence or rehomed before release preparation.

### Explicitly out of scope

Public package extraction, a retained-storage rewrite, speculative public APIs to improve a score, a universal fixture DSL without an actual consumer, and making all 78 assigned cards compulsory. Mechanical changes that require a public break belong in a major plan.

## Workstreams

These are coordination and ownership groups, not extra issues or inferred dependency edges. Every inventory card belongs to exactly one group; one executable issue still maps to one coherent, independently verifiable PR.

| Key | Workstream and outcome | Associated issues |
| --- | --- | --- |
| structure | **Structural facts, scorecards, and source hygiene.** Share policy producers and changed-file scope; optional metrics and automation must preserve that ownership. | [#265](https://github.com/git-stunts/git-warp/issues/265), [#391](https://github.com/git-stunts/git-warp/issues/391), [#393](https://github.com/git-stunts/git-warp/issues/393), [#397](https://github.com/git-stunts/git-warp/issues/397), [#404](https://github.com/git-stunts/git-warp/issues/404), [#405](https://github.com/git-stunts/git-warp/issues/405), [#416](https://github.com/git-stunts/git-warp/issues/416), [#417](https://github.com/git-stunts/git-warp/issues/417), [#437](https://github.com/git-stunts/git-warp/issues/437), [#438](https://github.com/git-stunts/git-warp/issues/438), [#441](https://github.com/git-stunts/git-warp/issues/441), [#442](https://github.com/git-stunts/git-warp/issues/442), [#445](https://github.com/git-stunts/git-warp/issues/445), [#451](https://github.com/git-stunts/git-warp/issues/451), [#856](https://github.com/git-stunts/git-warp/issues/856) |
| docs | **Executable documentation and contributor guidance.** Deliver the catalog-to-consumer chain and compatible documentation workflows. | [#112](https://github.com/git-stunts/git-warp/issues/112), [#117](https://github.com/git-stunts/git-warp/issues/117), [#119](https://github.com/git-stunts/git-warp/issues/119), [#120](https://github.com/git-stunts/git-warp/issues/120), [#127](https://github.com/git-stunts/git-warp/issues/127), [#133](https://github.com/git-stunts/git-warp/issues/133), [#390](https://github.com/git-stunts/git-warp/issues/390), [#410](https://github.com/git-stunts/git-warp/issues/410), [#411](https://github.com/git-stunts/git-warp/issues/411), [#412](https://github.com/git-stunts/git-warp/issues/412), [#419](https://github.com/git-stunts/git-warp/issues/419), [#444](https://github.com/git-stunts/git-warp/issues/444), [#578](https://github.com/git-stunts/git-warp/issues/578), [#669](https://github.com/git-stunts/git-warp/issues/669), [#671](https://github.com/git-stunts/git-warp/issues/671) |
| fixtures | **Typed fixtures and meaningful test evidence.** Establish complete typed hosts and protocol behavior, then select additional coverage/oracle campaigns. | [#130](https://github.com/git-stunts/git-warp/issues/130), [#132](https://github.com/git-stunts/git-warp/issues/132), [#193](https://github.com/git-stunts/git-warp/issues/193), [#261](https://github.com/git-stunts/git-warp/issues/261), [#262](https://github.com/git-stunts/git-warp/issues/262), [#276](https://github.com/git-stunts/git-warp/issues/276), [#363](https://github.com/git-stunts/git-warp/issues/363), [#364](https://github.com/git-stunts/git-warp/issues/364), [#365](https://github.com/git-stunts/git-warp/issues/365), [#366](https://github.com/git-stunts/git-warp/issues/366), [#414](https://github.com/git-stunts/git-warp/issues/414), [#415](https://github.com/git-stunts/git-warp/issues/415), [#425](https://github.com/git-stunts/git-warp/issues/425), [#426](https://github.com/git-stunts/git-warp/issues/426), [#427](https://github.com/git-stunts/git-warp/issues/427), [#428](https://github.com/git-stunts/git-warp/issues/428), [#439](https://github.com/git-stunts/git-warp/issues/439), [#440](https://github.com/git-stunts/git-warp/issues/440), [#580](https://github.com/git-stunts/git-warp/issues/580), [#668](https://github.com/git-stunts/git-warp/issues/668), [#684](https://github.com/git-stunts/git-warp/issues/684) |
| runtime | **Narrow runtime and boundary cleanup.** Repair one observable boundary at a time; verify historical claims before touching current owners. | [#161](https://github.com/git-stunts/git-warp/issues/161), [#184](https://github.com/git-stunts/git-warp/issues/184), [#200](https://github.com/git-stunts/git-warp/issues/200), [#201](https://github.com/git-stunts/git-warp/issues/201), [#212](https://github.com/git-stunts/git-warp/issues/212), [#213](https://github.com/git-stunts/git-warp/issues/213), [#216](https://github.com/git-stunts/git-warp/issues/216), [#237](https://github.com/git-stunts/git-warp/issues/237), [#478](https://github.com/git-stunts/git-warp/issues/478) |
| tooling | **Workflow tools and backlog visibility.** Keep proposed automation consumer-driven and portable; do not add scheduling dependencies merely for convenience. | [#122](https://github.com/git-stunts/git-warp/issues/122), [#167](https://github.com/git-stunts/git-warp/issues/167), [#215](https://github.com/git-stunts/git-warp/issues/215), [#249](https://github.com/git-stunts/git-warp/issues/249), [#423](https://github.com/git-stunts/git-warp/issues/423), [#500](https://github.com/git-stunts/git-warp/issues/500), [#601](https://github.com/git-stunts/git-warp/issues/601), [#602](https://github.com/git-stunts/git-warp/issues/602), [#603](https://github.com/git-stunts/git-warp/issues/603), [#619](https://github.com/git-stunts/git-warp/issues/619), [#841](https://github.com/git-stunts/git-warp/issues/841) |
| release | **Release evidence and publication maintenance.** Improve repeatable publication and retrospective evidence without replacing the release profile. | [#121](https://github.com/git-stunts/git-warp/issues/121), [#371](https://github.com/git-stunts/git-warp/issues/371), [#690](https://github.com/git-stunts/git-warp/issues/690), [#691](https://github.com/git-stunts/git-warp/issues/691), [#803](https://github.com/git-stunts/git-warp/issues/803), [#804](https://github.com/git-stunts/git-warp/issues/804), [#861](https://github.com/git-stunts/git-warp/issues/861) |

## Dependency structure

The mandatory convergence chains are [#437](https://github.com/git-stunts/git-warp/issues/437) + [#441](https://github.com/git-stunts/git-warp/issues/441) → [#405](https://github.com/git-stunts/git-warp/issues/405) → [#438](https://github.com/git-stunts/git-warp/issues/438), [#427](https://github.com/git-stunts/git-warp/issues/427) → [#414](https://github.com/git-stunts/git-warp/issues/414) → [#363](https://github.com/git-stunts/git-warp/issues/363), and [#669](https://github.com/git-stunts/git-warp/issues/669) → [#444](https://github.com/git-stunts/git-warp/issues/444) / [#578](https://github.com/git-stunts/git-warp/issues/578). These are accepted shared-producer ownership decisions. Each producer must work against the existing system before its consumer lands.

Candidate paths include [#391](https://github.com/git-stunts/git-warp/issues/391) + [#437](https://github.com/git-stunts/git-warp/issues/437) → [#397](https://github.com/git-stunts/git-warp/issues/397), [#684](https://github.com/git-stunts/git-warp/issues/684) → [#415](https://github.com/git-stunts/git-warp/issues/415), [#193](https://github.com/git-stunts/git-warp/issues/193) → [#440](https://github.com/git-stunts/git-warp/issues/440), [#265](https://github.com/git-stunts/git-warp/issues/265) → [#445](https://github.com/git-stunts/git-warp/issues/445), and [#669](https://github.com/git-stunts/git-warp/issues/669) → [#419](https://github.com/git-stunts/git-warp/issues/419). The metrics dashboard does not block the scorecard; extra fixture conversions do not block the scoped real-protocol witness. The three mandatory fronts have no recorded inter-front prerequisite, but share repository policy and CI integration; resolve concrete interface collisions before declaring them independent.

This milestone has **14 incoming direct edges** in the accepted 79-edge graph. 0 originate in an earlier release. Version order is a release policy; absence of a task edge is not proof that contracts are independent.

The following direct prerequisites are generated from the accepted graph. An arrow means the blocker PR must already be integrated for the dependent PR to be correct; preparatory design or witness work may start earlier. "Accepted ownership" and scope reconciliation are planning decisions, not claims that all edges were present in the original reports. Transitive contractual edges are retained.

| Blocker | Dependent | Basis and reason |
| --- | --- | --- |
| [#193](https://github.com/git-stunts/git-warp/issues/193) | [#440](https://github.com/git-stunts/git-warp/issues/440) | previously accepted: Settle absent-owner, empty-dot, effective removal and concurrent re-add semantics in [#193](https://github.com/git-stunts/git-warp/issues/193) before [#440](https://github.com/git-stunts/git-warp/issues/440) encodes reusable remove oracles. The current NodeRemove constructor requires owner identity but permits empty arrays; the old assertion that every empty-dot remove is illegal is not accepted as truth. [source 1](https://github.com/git-stunts/git-warp/issues/440) |
| [#265](https://github.com/git-stunts/git-warp/issues/265) | [#445](https://github.com/git-stunts/git-warp/issues/445) | previously accepted: Assign the canonical internal error-code registry and throw-site adoption to [#265](https://github.com/git-stunts/git-warp/issues/265); [#445](https://github.com/git-stunts/git-warp/issues/445) owns supported-package export and consumer checks. Keep existing emitted code values compatible; public exposure consumes the registry instead of independently creating a second owner. [source 1](https://github.com/git-stunts/git-warp/issues/445) |
| [#391](https://github.com/git-stunts/git-warp/issues/391) | [#397](https://github.com/git-stunts/git-warp/issues/397) | accepted-ownership: Assign class/module complexity metrics and their evidence to [#391](https://github.com/git-stunts/git-warp/issues/391). [#397](https://github.com/git-stunts/git-warp/issues/397) aggregates those god-object signals into the ranked report; it does not own a second complexity evaluator. [source 1](https://github.com/git-stunts/git-warp/issues/391) [source 2](https://github.com/git-stunts/git-warp/issues/397) |
| [#405](https://github.com/git-stunts/git-warp/issues/405) | [#438](https://github.com/git-stunts/git-warp/issues/438) | previously accepted: Assign the reusable scorecard scanner and report contract to [#405](https://github.com/git-stunts/git-warp/issues/405), then make [#438](https://github.com/git-stunts/git-warp/issues/438) a thin staged-input hook consuming it. The cards explicitly share a scanner; two independent scanners would duplicate policy.  Evidence: [#405](https://github.com/git-stunts/git-warp/issues/405) How this differs: shared scanner library; [#438](https://github.com/git-stunts/git-warp/issues/438) automated scorecard hook |
| [#414](https://github.com/git-stunts/git-warp/issues/414) | [#363](https://github.com/git-stunts/git-warp/issues/363) | accepted-ownership: Assign the reusable typed controller host/capability fixture to [#414](https://github.com/git-stunts/git-warp/issues/414). [#363](https://github.com/git-stunts/git-warp/issues/363) consumes that harness and owns real SyncProtocol behavior assertions and failure witnesses, replacing its private hand-built host and module-mock-only proof. [source 1](https://github.com/git-stunts/git-warp/issues/414) [source 2](https://github.com/git-stunts/git-warp/issues/363) |
| [#427](https://github.com/git-stunts/git-warp/issues/427) | [#366](https://github.com/git-stunts/git-warp/issues/366) | scope reconciled: [#427](https://github.com/git-stunts/git-warp/issues/427) strengthens the existing canonical factory so completeness is checked against CorePersistence; [#366](https://github.com/git-stunts/git-warp/issues/366) consumes that verified factory while migrating all incomplete users. Do not create a second factory. [source 1](https://github.com/git-stunts/git-warp/issues/427#issuecomment-5935256107) |
| [#427](https://github.com/git-stunts/git-warp/issues/427) | [#414](https://github.com/git-stunts/git-warp/issues/414) | accepted-ownership: The existing mock host already calls createMockPersistence. [#427](https://github.com/git-stunts/git-warp/issues/427) owns making that factory complete against the real persistence contract; [#414](https://github.com/git-stunts/git-warp/issues/414) consumes it for typed controller hosts rather than copying persistence methods. [source 1](https://github.com/git-stunts/git-warp/issues/427) [source 2](https://github.com/git-stunts/git-warp/issues/414) |
| [#437](https://github.com/git-stunts/git-warp/issues/437) | [#397](https://github.com/git-stunts/git-warp/issues/397) | accepted-ownership: The dashboard consumes authoritative structural conformance findings from [#437](https://github.com/git-stunts/git-warp/issues/437) alongside [#391](https://github.com/git-stunts/git-warp/issues/391) complexity facts. [#397](https://github.com/git-stunts/git-warp/issues/397) owns aggregation and severity presentation, not duplicate SSTS rule implementations. [source 1](https://github.com/git-stunts/git-warp/issues/437) [source 2](https://github.com/git-stunts/git-warp/issues/397) |
| [#437](https://github.com/git-stunts/git-warp/issues/437) | [#405](https://github.com/git-stunts/git-warp/issues/405) | accepted-ownership: Assign structural SSTS rule evaluation and machine-readable findings to [#437](https://github.com/git-stunts/git-warp/issues/437). [#405](https://github.com/git-stunts/git-warp/issues/405) owns diff selection and scorecard rendering, consuming those findings instead of reimplementing export, freeze and boundary rules. [source 1](https://github.com/git-stunts/git-warp/issues/437) [source 2](https://github.com/git-stunts/git-warp/issues/405) |
| [#441](https://github.com/git-stunts/git-warp/issues/441) | [#405](https://github.com/git-stunts/git-warp/issues/405) | accepted-ownership: The touched-files command explicitly proposes feeding the scorecard. Assign merge-base changed-file classification to [#441](https://github.com/git-stunts/git-warp/issues/441) and have [#405](https://github.com/git-stunts/git-warp/issues/405) consume it. Retain import-only/body distinctions where relevant; do not revive obsolete JavaScript migration work. [source 1](https://github.com/git-stunts/git-warp/issues/441) [source 2](https://github.com/git-stunts/git-warp/issues/405) |
| [#669](https://github.com/git-stunts/git-warp/issues/669) | [#419](https://github.com/git-stunts/git-warp/issues/419) | scope reconciled: Use [#669](https://github.com/git-stunts/git-warp/issues/669) as the single validated inventory of current public documentation. The freshness gate in [#419](https://github.com/git-stunts/git-warp/issues/419) consumes its paths and source-truth anchors so retired documentation cannot silently enter its current-truth checks. [source 1](https://github.com/git-stunts/git-warp/issues/419) |
| [#669](https://github.com/git-stunts/git-warp/issues/669) | [#444](https://github.com/git-stunts/git-warp/issues/444) | accepted-ownership: The snippet runner must use the current public documentation corpus, not retired GUIDE paths. Assign corpus membership and page metadata to [#669](https://github.com/git-stunts/git-warp/issues/669); [#444](https://github.com/git-stunts/git-warp/issues/444) discovers executable examples from that catalog and owns their harness. [source 1](https://github.com/git-stunts/git-warp/issues/669) [source 2](https://github.com/git-stunts/git-warp/issues/444) |
| [#669](https://github.com/git-stunts/git-warp/issues/669) | [#578](https://github.com/git-stunts/git-warp/issues/578) | accepted-ownership: Use [#669](https://github.com/git-stunts/git-warp/issues/669) as the owner of live-page audience/kind metadata used to select first-use documentation. [#578](https://github.com/git-stunts/git-warp/issues/578) combines that selection with the existing API cost inventory; it must not maintain a competing public-page catalog. [source 1](https://github.com/git-stunts/git-warp/issues/669) [source 2](https://github.com/git-stunts/git-warp/issues/578) |
| [#684](https://github.com/git-stunts/git-warp/issues/684) | [#415](https://github.com/git-stunts/git-warp/issues/415) | accepted-ownership: Assign named causal scenarios and independent expected outcomes to [#684](https://github.com/git-stunts/git-warp/issues/684). [#415](https://github.com/git-stunts/git-warp/issues/415) owns the cross-path runner/comparators and demonstrates reuse of that corpus across production paths. The corpus first lands green with one reducer consumer. [source 1](https://github.com/git-stunts/git-warp/issues/684) [source 2](https://github.com/git-stunts/git-warp/issues/415) |

## Release evidence

| Claim | Required release witness |
| --- | --- |
| One structural truth | Known conforming and deliberately violating fixtures produce the same facts through the suite, diff scorecard, and hook ([#437](https://github.com/git-stunts/git-warp/issues/437)/[#405](https://github.com/git-stunts/git-warp/issues/405)/[#438](https://github.com/git-stunts/git-warp/issues/438)). |
| Changed-file scope is correct | Renames, deletions, staged/unstaged changes, multiple commits, and merge-base selection, with missing/unavailable checks reported honestly ([#441](https://github.com/git-stunts/git-warp/issues/441)). |
| Fixtures model the contract | Complete persistence factory and controller capability host reject unsupported/incomplete inputs; the real SyncProtocol behavior test covers success and failure, not mock call counts ([#427](https://github.com/git-stunts/git-warp/issues/427)/[#414](https://github.com/git-stunts/git-warp/issues/414)/[#363](https://github.com/git-stunts/git-warp/issues/363)). |
| Docs are executable | Catalog-backed examples pass; a deliberately broken example fails; first-use cost claims are checked against the catalog and actual supported APIs ([#669](https://github.com/git-stunts/git-warp/issues/669)/[#444](https://github.com/git-stunts/git-warp/issues/444)/[#578](https://github.com/git-stunts/git-warp/issues/578)). |
| Refactors preserve behavior | Relevant Docker suites, touched-code coverage, manual SSJS checklist, and consumer compatibility evidence for each selected refactor. |

Record missing automation explicitly. Green structural tooling supports review; it does not establish semantic correctness or absence of regressions.

These are required future release witnesses, not results produced by writing this plan. Link each result to its source commit, reproducible command, fixture/configuration, container image, and resulting integration commit. Use the [release procedure](../../../.github/RELEASE.md) and [release profile](../../../.continuum/release.yml) for the current commands and artifact checks. All tests and benchmarks execute in COPY-based Docker; never mount host repositories or Git directories.

## Risks and open questions

- The 78-card bucket can become a cleanup sink. Freeze the ten required outcomes and make promotion/defer decisions explicit.
- Multiple "scorecard" proposals can recreate competing policy engines. Keep the recorded [#437](https://github.com/git-stunts/git-warp/issues/437)/[#405](https://github.com/git-stunts/git-warp/issues/405)/[#438](https://github.com/git-stunts/git-warp/issues/438) ownership chain.
- Test helpers may standardize implementation details rather than observable behavior. Require a real consumer and a meaningful failing control.
- Historical titles mention removed JS files, retired documentation, or old release failures. Preserve traceability while narrowing actual remaining work.
- The [#193](https://github.com/git-stunts/git-warp/issues/193) removal-semantics question is unresolved. Do not bake its historical hypothesis into [#440](https://github.com/git-stunts/git-warp/issues/440) as truth.

## Slip policy

Candidates and discovery can move independently unless they become accepted prerequisites of the ten required outcomes. Split a campaign only at independently mergeable boundaries, with complete requirement ownership and remapped edges. If any shared producer or required consumer slips, revise the release proposition; do not ship a hook that reports unsupported checks as green.

Before release preparation, complete or explicitly move every unfinished candidate, discovery, and container to an appropriate later release home in both trackers; update affected prerequisites and regenerate this inventory. The [release guard](../../../scripts/release-guard.sh) requires zero open non-`type:release` issues in the target milestone and zero open issues in prior version milestones. It also checks repository-wide `priority:asap` work. A prose "may slip" category never bypasses those gates. Required work cannot be removed merely to make the count zero.

## Completion criteria

The milestone is complete only when every applicable condition below is true; missing evidence is an unmet condition.

- The three mandatory producer/consumer chains execute end to end with passing and intentionally failing controls.
- All ten must-ship cards link coherent PRs and mainline integration commits; selected refactors meet coverage/policy requirements.
- No incompatible runtime/CLI/storage change is smuggled into the engineering minor.
- The 51 candidates, 14 discoveries, and three containers are explicitly completed or rehomed; a large inventory is not treated as evidence of delivery.
- Every selected executable issue links one coherent PR and its resulting mainline integration commit, with issue-specific acceptance evidence; tracking parents add no duplicate implementation credit.
- Required label axes, milestone assignments, prerequisite disposition, and the actual release guard pass; unselected work is rehomed before release preparation.
- Required CI, compatibility and Docker witnesses pass on the exact release source. Metadata, changelog, architecture, topics, and operator guidance describe what shipped.
- The normal release process completes review, immutable tagging, registry verification, and the post-release retrospective before the next train activates. This plan does not itself authorize merging or publication.

## Issue inventory

<!-- BEGIN GENERATED ISSUE INVENTORY -->
Generated from the GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific). This is the complete **78-issue planning inventory** for this milestone, not a live completion counter. Titles retain tracker wording, including historical names; each linked issue's current scope/disposition governs implementation.

Every issue has one release home, one commitment category, and one workstream below. A dash in prerequisites means no accepted open-issue prerequisite in this graph; it does not establish independence. Earlier-release prerequisites remain visible.

### Must ship (10)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#363](https://github.com/git-stunts/git-warp/issues/363) — SyncController tests mock 3 modules — test only proves wiring | [FLY-98](https://linear.app/flyingrobots/issue/FLY-98/synccontroller-tests-mock-3-modules-test-only-proves-wiring) | fixtures | [#414](https://github.com/git-stunts/git-warp/issues/414) |
| [#405](https://github.com/git-stunts/git-warp/issues/405) — Auto-generate the SSTS scorecard from git diff | [FLY-120](https://linear.app/flyingrobots/issue/FLY-120/auto-generate-the-ssts-scorecard-from-git-diff) | structure | [#437](https://github.com/git-stunts/git-warp/issues/437), [#441](https://github.com/git-stunts/git-warp/issues/441) |
| [#414](https://github.com/git-stunts/git-warp/issues/414) — Controller test harness — mock host with typed capability surface | [FLY-126](https://linear.app/flyingrobots/issue/FLY-126/controller-test-harness-mock-host-with-typed-capability-surface) | fixtures | [#427](https://github.com/git-stunts/git-warp/issues/427) |
| [#427](https://github.com/git-stunts/git-warp/issues/427) — MockPersistenceFactory — typed, complete, safe | [FLY-139](https://linear.app/flyingrobots/issue/FLY-139/mockpersistencefactory-typed-complete-safe) | fixtures | — |
| [#437](https://github.com/git-stunts/git-warp/issues/437) — SSTS Conformance Suite | [FLY-146](https://linear.app/flyingrobots/issue/FLY-146/ssts-conformance-suite) | structure | — |
| [#438](https://github.com/git-stunts/git-warp/issues/438) — Systems-Style Scorecard as pre-commit hook | [FLY-147](https://linear.app/flyingrobots/issue/FLY-147/systems-style-scorecard-as-pre-commit-hook) | structure | [#405](https://github.com/git-stunts/git-warp/issues/405) |
| [#441](https://github.com/git-stunts/git-warp/issues/441) — `touched-files-status` — one command to show every file changed on a branch | [FLY-150](https://linear.app/flyingrobots/issue/FLY-150/touched-files-status-one-command-to-show-every-file-changed-on-a) | structure | — |
| [#444](https://github.com/git-stunts/git-warp/issues/444) — Doc-as-test pipeline: run code snippets from docs as tests | [FLY-153](https://linear.app/flyingrobots/issue/FLY-153/doc-as-test-pipeline-run-code-snippets-from-docs-as-tests) | docs | [#669](https://github.com/git-stunts/git-warp/issues/669) |
| [#578](https://github.com/git-stunts/git-warp/issues/578) — COOL: generate first-use docs guards from the public API cost inventory | [FLY-208](https://linear.app/flyingrobots/issue/FLY-208/cool-generate-first-use-docs-guards-from-the-public-api-cost-inventory) | docs | [#669](https://github.com/git-stunts/git-warp/issues/669) |
| [#669](https://github.com/git-stunts/git-warp/issues/669) — COOL: add a machine-readable docs topic catalog | [FLY-216](https://linear.app/flyingrobots/issue/FLY-216/cool-add-a-machine-readable-docs-topic-catalog) | docs | — |

### Required disposition (0)

None assigned in this snapshot.

### May slip (51)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#112](https://github.com/git-stunts/git-warp/issues/112) — API Examples Review Checklist | [FLY-5](https://linear.app/flyingrobots/issue/FLY-5/api-examples-review-checklist) | docs | — |
| [#117](https://github.com/git-stunts/git-warp/issues/117) — Contributor Review-Loop Hygiene Guide | [FLY-9](https://linear.app/flyingrobots/issue/FLY-9/contributor-review-loop-hygiene-guide) | docs | — |
| [#119](https://github.com/git-stunts/git-warp/issues/119) — Docs Consistency Preflight | [FLY-11](https://linear.app/flyingrobots/issue/FLY-11/docs-consistency-preflight) | docs | — |
| [#120](https://github.com/git-stunts/git-warp/issues/120) — Docs-Version-Sync Pre-Commit Check | [FLY-12](https://linear.app/flyingrobots/issue/FLY-12/docs-version-sync-pre-commit-check) | docs | — |
| [#122](https://github.com/git-stunts/git-warp/issues/122) — `scripts/pr-ready` Merge-Readiness CLI | [FLY-14](https://linear.app/flyingrobots/issue/FLY-14/scriptspr-ready-merge-readiness-cli) | tooling | — |
| [#127](https://github.com/git-stunts/git-warp/issues/127) — Review bot warning policy | [FLY-19](https://linear.app/flyingrobots/issue/FLY-19/review-bot-warning-policy) | docs | — |
| [#132](https://github.com/git-stunts/git-warp/issues/132) — Vitest Explicit Runtime Excludes | [FLY-24](https://linear.app/flyingrobots/issue/FLY-24/vitest-explicit-runtime-excludes) | fixtures | — |
| [#133](https://github.com/git-stunts/git-warp/issues/133) — WarpGraph Constructor Lifecycle Docs | [FLY-25](https://linear.app/flyingrobots/issue/FLY-25/warpgraph-constructor-lifecycle-docs) | docs | — |
| [#184](https://github.com/git-stunts/git-warp/issues/184) — WriterId.js uses crypto.getRandomValues in domain | [FLY-48](https://linear.app/flyingrobots/issue/FLY-48/writeridjs-uses-cryptogetrandomvalues-in-domain) | runtime | — |
| [#201](https://github.com/git-stunts/git-warp/issues/201) — Strand model still lives as a typedef corridor across collaborator files | [FLY-57](https://linear.app/flyingrobots/issue/FLY-57/strand-model-still-lives-as-a-typedef-corridor-across-collaborator) | runtime | — |
| [#212](https://github.com/git-stunts/git-warp/issues/212) — ComparisonController contains 4 shadow selector classes | [FLY-62](https://linear.app/flyingrobots/issue/FLY-62/comparisoncontroller-contains-4-shadow-selector-classes) | runtime | — |
| [#213](https://github.com/git-stunts/git-warp/issues/213) — ConflictAnalyzerService has dead and self-cancelling branches | [FLY-63](https://linear.app/flyingrobots/issue/FLY-63/conflictanalyzerservice-has-dead-and-self-cancelling-branches) | runtime | — |
| [#237](https://github.com/git-stunts/git-warp/issues/237) — PROTO_trust-record-service-unreachable-exhausted-tails | [FLY-79](https://linear.app/flyingrobots/issue/FLY-79/proto-trust-record-service-unreachable-exhausted-tails) | runtime | — |
| [#262](https://github.com/git-stunts/git-warp/issues/262) — DagPathFinding.js (705 LOC) has zero tests and 5 functions >50 LOC | [FLY-94](https://linear.app/flyingrobots/issue/FLY-94/dagpathfindingjs-705-loc-has-zero-tests-and-5-functions-50-loc) | fixtures | — |
| [#265](https://github.com/git-stunts/git-warp/issues/265) — Error code naming inconsistency across throw sites | [FLY-95](https://linear.app/flyingrobots/issue/FLY-95/error-code-naming-inconsistency-across-throw-sites) | structure | — |
| [#276](https://github.com/git-stunts/git-warp/issues/276) — QueryBuilder tests exist but still carry legacy scaffolding sludge | [FLY-97](https://linear.app/flyingrobots/issue/FLY-97/querybuilder-tests-exist-but-still-carry-legacy-scaffolding-sludge) | fixtures | — |
| [#366](https://github.com/git-stunts/git-warp/issues/366) — 20+ test files create incomplete persistence mocks | [FLY-101](https://linear.app/flyingrobots/issue/FLY-101/20-test-files-create-incomplete-persistence-mocks) | fixtures | [#427](https://github.com/git-stunts/git-warp/issues/427) |
| [#390](https://github.com/git-stunts/git-warp/issues/390) — Source-change guard for doc-only cycles | [FLY-107](https://linear.app/flyingrobots/issue/FLY-107/source-change-guard-for-doc-only-cycles) | docs | — |
| [#391](https://github.com/git-stunts/git-warp/issues/391) — NO GODS CI Report | [FLY-108](https://linear.app/flyingrobots/issue/FLY-108/no-gods-ci-report) | structure | — |
| [#393](https://github.com/git-stunts/git-warp/issues/393) — Precommit Sludge Guillotine | [FLY-110](https://linear.app/flyingrobots/issue/FLY-110/precommit-sludge-guillotine) | structure | — |
| [#397](https://github.com/git-stunts/git-warp/issues/397) — Sludge Score Dashboard | [FLY-114](https://linear.app/flyingrobots/issue/FLY-114/sludge-score-dashboard) | structure | [#391](https://github.com/git-stunts/git-warp/issues/391), [#437](https://github.com/git-stunts/git-warp/issues/437) |
| [#404](https://github.com/git-stunts/git-warp/issues/404) — Agent ratchet telemetry — per-commit snapshot of tsc/lint/tests | [FLY-119](https://linear.app/flyingrobots/issue/FLY-119/agent-ratchet-telemetry-per-commit-snapshot-of-tsclinttests) | structure | — |
| [#410](https://github.com/git-stunts/git-warp/issues/410) — Self-healing CLAUDE.md — generated from codebase truth | [FLY-123](https://linear.app/flyingrobots/issue/FLY-123/self-healing-claudemd-generated-from-codebase-truth) | docs | — |
| [#411](https://github.com/git-stunts/git-warp/issues/411) — CLAUDESPEED session handoff protocol | [FLY-124](https://linear.app/flyingrobots/issue/FLY-124/claudespeed-session-handoff-protocol) | docs | — |
| [#412](https://github.com/git-stunts/git-warp/issues/412) — Expand CLI_GUIDE.md with complete command reference | [FLY-125](https://linear.app/flyingrobots/issue/FLY-125/expand-cli-guidemd-with-complete-command-reference) | docs | — |
| [#415](https://github.com/git-stunts/git-warp/issues/415) — Cross-path equivalence as a general testing pattern | [FLY-127](https://linear.app/flyingrobots/issue/FLY-127/cross-path-equivalence-as-a-general-testing-pattern) | fixtures | [#684](https://github.com/git-stunts/git-warp/issues/684) |
| [#416](https://github.com/git-stunts/git-warp/issues/416) — Dead code cemetery — automated detection | [FLY-128](https://linear.app/flyingrobots/issue/FLY-128/dead-code-cemetery-automated-detection) | structure | — |
| [#417](https://github.com/git-stunts/git-warp/issues/417) — DX_dead-export-ratchet | [FLY-129](https://linear.app/flyingrobots/issue/FLY-129/dx-dead-export-ratchet) | structure | — |
| [#419](https://github.com/git-stunts/git-warp/issues/419) — Documentation freshness ratchet | [FLY-131](https://linear.app/flyingrobots/issue/FLY-131/documentation-freshness-ratchet) | docs | [#669](https://github.com/git-stunts/git-warp/issues/669) |
| [#425](https://github.com/git-stunts/git-warp/issues/425) — CI gate that audits all invariants on every PR | [FLY-137](https://linear.app/flyingrobots/issue/FLY-137/ci-gate-that-audits-all-invariants-on-every-pr) | fixtures | — |
| [#428](https://github.com/git-stunts/git-warp/issues/428) — Mutation testing to find tests that bless bugs | [FLY-140](https://linear.app/flyingrobots/issue/FLY-140/mutation-testing-to-find-tests-that-bless-bugs) | fixtures | — |
| [#439](https://github.com/git-stunts/git-warp/issues/439) — ESLint rule for vacuous test assertions | [FLY-148](https://linear.app/flyingrobots/issue/FLY-148/eslint-rule-for-vacuous-test-assertions) | fixtures | — |
| [#440](https://github.com/git-stunts/git-warp/issues/440) — Test oracle invariants — assert what MUST be true, not what IS true | [FLY-149](https://linear.app/flyingrobots/issue/FLY-149/test-oracle-invariants-assert-what-must-be-true-not-what-is-true) | fixtures | [#193](https://github.com/git-stunts/git-warp/issues/193) |
| [#442](https://github.com/git-stunts/git-warp/issues/442) — Mechanical tsc autofix tool | [FLY-151](https://linear.app/flyingrobots/issue/FLY-151/mechanical-tsc-autofix-tool) | structure | — |
| [#445](https://github.com/git-stunts/git-warp/issues/445) — Error code registry as importable constants | [FLY-154](https://linear.app/flyingrobots/issue/FLY-154/error-code-registry-as-importable-constants) | structure | [#265](https://github.com/git-stunts/git-warp/issues/265) |
| [#451](https://github.com/git-stunts/git-warp/issues/451) — CI alert when change-coupling score increases | [FLY-160](https://linear.app/flyingrobots/issue/FLY-160/ci-alert-when-change-coupling-score-increases) | structure | — |
| [#478](https://github.com/git-stunts/git-warp/issues/478) — Safe path-map materialization pattern | [FLY-185](https://linear.app/flyingrobots/issue/FLY-185/safe-path-map-materialization-pattern) | runtime | — |
| [#500](https://github.com/git-stunts/git-warp/issues/500) — METHOD MCP workspace detection drift | [FLY-194](https://linear.app/flyingrobots/issue/FLY-194/method-mcp-workspace-detection-drift) | tooling | — |
| [#601](https://github.com/git-stunts/git-warp/issues/601) — COOL IDEA: repository inventory witness command | [FLY-210](https://linear.app/flyingrobots/issue/FLY-210/cool-idea-repository-inventory-witness-command) | tooling | — |
| [#602](https://github.com/git-stunts/git-warp/issues/602) — COOL IDEA: batch PR witness dashboard | [FLY-211](https://linear.app/flyingrobots/issue/FLY-211/cool-idea-batch-pr-witness-dashboard) | tooling | — |
| [#603](https://github.com/git-stunts/git-warp/issues/603) — COOL IDEA: issue completion scanner | [FLY-212](https://linear.app/flyingrobots/issue/FLY-212/cool-idea-issue-completion-scanner) | tooling | — |
| [#619](https://github.com/git-stunts/git-warp/issues/619) — Generate an issue triage report for bad-code batch planning | [FLY-213](https://linear.app/flyingrobots/issue/FLY-213/generate-an-issue-triage-report-for-bad-code-batch-planning) | tooling | — |
| [#668](https://github.com/git-stunts/git-warp/issues/668) — Refactor strand tests off the private-member mega-harness | [FLY-215](https://linear.app/flyingrobots/issue/FLY-215/refactor-strand-tests-off-the-private-member-mega-harness) | fixtures | — |
| [#671](https://github.com/git-stunts/git-warp/issues/671) — Remove stale source comments that cite retired design/spec docs | [FLY-217](https://linear.app/flyingrobots/issue/FLY-217/remove-stale-source-comments-that-cite-retired-designspec-docs) | docs | — |
| [#684](https://github.com/git-stunts/git-warp/issues/684) — COOL IDEA: deterministic multi-writer scenario corpus | [FLY-218](https://linear.app/flyingrobots/issue/FLY-218/cool-idea-deterministic-multi-writer-scenario-corpus) | fixtures | — |
| [#690](https://github.com/git-stunts/git-warp/issues/690) — COOL IDEA: generate post-release retrospective scaffolds | [FLY-219](https://linear.app/flyingrobots/issue/FLY-219/cool-idea-generate-post-release-retrospective-scaffolds) | release | — |
| [#691](https://github.com/git-stunts/git-warp/issues/691) — COOL IDEA: validate the release state machine | [FLY-220](https://linear.app/flyingrobots/issue/FLY-220/cool-idea-validate-the-release-state-machine) | release | — |
| [#803](https://github.com/git-stunts/git-warp/issues/803) — Publish curated release notes before generated PR history | [FLY-225](https://linear.app/flyingrobots/issue/FLY-225/publish-curated-release-notes-before-generated-pr-history) | release | — |
| [#804](https://github.com/git-stunts/git-warp/issues/804) — Reference the goalpost when opening release PRs | [FLY-226](https://linear.app/flyingrobots/issue/FLY-226/reference-the-goalpost-when-opening-release-prs) | release | — |
| [#841](https://github.com/git-stunts/git-warp/issues/841) — COOL IDEA™: extend machine-local path hygiene to GitHub metadata | [FLY-241](https://linear.app/flyingrobots/issue/FLY-241/cool-ideatm-extend-machine-local-path-hygiene-to-github-metadata) | tooling | — |
| [#856](https://github.com/git-stunts/git-warp/issues/856) — BAD CODE™: make the formatter contract match checked-in TypeScript | [FLY-243](https://linear.app/flyingrobots/issue/FLY-243/bad-codetm-make-the-formatter-contract-match-checked-in-typescript) | structure | — |

### Discovery (14)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#121](https://github.com/git-stunts/git-warp/issues/121) — Fix JSR Publish Dry-Run Deno Panic | [FLY-13](https://linear.app/flyingrobots/issue/FLY-13/fix-jsr-publish-dry-run-deno-panic) | release | — |
| [#130](https://github.com/git-stunts/git-warp/issues/130) — Test-File Wildcard Ratchet | [FLY-22](https://linear.app/flyingrobots/issue/FLY-22/test-file-wildcard-ratchet) | fixtures | — |
| [#161](https://github.com/git-stunts/git-warp/issues/161) — PROTO_roaring-loader-fallback-opacity | [FLY-38](https://linear.app/flyingrobots/issue/FLY-38/proto-roaring-loader-fallback-opacity) | runtime | — |
| [#167](https://github.com/git-stunts/git-warp/issues/167) — CLI hook installer bypasses ports with raw git subprocesses | [FLY-41](https://linear.app/flyingrobots/issue/FLY-41/cli-hook-installer-bypasses-ports-with-raw-git-subprocesses) | tooling | — |
| [#193](https://github.com/git-stunts/git-warp/issues/193) — JoinReducer accepts NodeRemove/EdgeRemove with empty observedDots and no node/edge fields | [FLY-55](https://linear.app/flyingrobots/issue/FLY-55/joinreducer-accepts-noderemoveedgeremove-with-empty-observeddots-and) | fixtures | — |
| [#200](https://github.com/git-stunts/git-warp/issues/200) — strandPublicShape.js is a complex identity transform | [FLY-56](https://linear.app/flyingrobots/issue/FLY-56/strandpublicshapejs-is-a-complex-identity-transform) | runtime | — |
| [#215](https://github.com/git-stunts/git-warp/issues/215) — CC_dead-exports-182 | [FLY-65](https://linear.app/flyingrobots/issue/FLY-65/cc-dead-exports-182) | tooling | — |
| [#216](https://github.com/git-stunts/git-warp/issues/216) — Detached graph openers duplicate and drift from WarpRuntime.open() | [FLY-66](https://linear.app/flyingrobots/issue/FLY-66/detached-graph-openers-duplicate-and-drift-from-warpruntimeopen) | runtime | — |
| [#249](https://github.com/git-stunts/git-warp/issues/249) — HookInstaller uses an ad hoc git config callback instead of a typed port | [FLY-89](https://linear.app/flyingrobots/issue/FLY-89/hookinstaller-uses-an-ad-hoc-git-config-callback-instead-of-a-typed) | tooling | — |
| [#365](https://github.com/git-stunts/git-warp/issues/365) — Test helper overlap — consolidate fixture DSLs | [FLY-100](https://linear.app/flyingrobots/issue/FLY-100/test-helper-overlap-consolidate-fixture-dsls) | fixtures | — |
| [#371](https://github.com/git-stunts/git-warp/issues/371) — SPEC_v17-release-self-review-blockers | [FLY-103](https://linear.app/flyingrobots/issue/FLY-103/spec-v17-release-self-review-blockers) | release | — |
| [#423](https://github.com/git-stunts/git-warp/issues/423) — Graft cool ideas (post-Phase 1) | [FLY-135](https://linear.app/flyingrobots/issue/FLY-135/graft-cool-ideas-post-phase-1) | tooling | — |
| [#426](https://github.com/git-stunts/git-warp/issues/426) — Convert 29 remaining JS test helper files to TypeScript | [FLY-138](https://linear.app/flyingrobots/issue/FLY-138/convert-29-remaining-js-test-helper-files-to-typescript) | fixtures | — |
| [#861](https://github.com/git-stunts/git-warp/issues/861) — BAD CODE™: retire the shell-based JSR npm publication shim | [FLY-244](https://linear.app/flyingrobots/issue/FLY-244/bad-codetm-retire-the-shell-based-jsr-npm-publication-shim) | release | — |

### Tracking (3)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#261](https://github.com/git-stunts/git-warp/issues/261) — Coverage ratchet baseline dropped during v17 release preflight | [FLY-93](https://linear.app/flyingrobots/issue/FLY-93/coverage-ratchet-baseline-dropped-during-v17-release-preflight) | fixtures | — |
| [#364](https://github.com/git-stunts/git-warp/issues/364) — 30 test files over 800 LOC — test gods | [FLY-99](https://linear.app/flyingrobots/issue/FLY-99/30-test-files-over-800-loc-test-gods) | fixtures | — |
| [#580](https://github.com/git-stunts/git-warp/issues/580) — Consolidate static-text assertion cleanup campaign | [FLY-209](https://linear.app/flyingrobots/issue/FLY-209/consolidate-static-text-assertion-cleanup-campaign) | fixtures | — |

<!-- END GENERATED ISSUE INVENTORY -->
