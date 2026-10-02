# v21.2.0 — Reusable packages and generated domain clients

Planning status: proposed delivery plan for the accepted [v21.2.0 milestone](https://github.com/git-stunts/git-warp/milestone/23) and matching milestone in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452). Owner: James Ross. No target date is assigned. [All release plans](../README.md).

Snapshot: 2026-10-01 Pacific; source baseline `94b40dac64034cd8caab9bb05efe14a0c22bd735`. Live issue homes/titles and recorded GitHub prerequisites were reconciled with Linear at `2026-10-02T04:24:27.613318+00:00`. Inventory: **7 cards** (6 must ship; 1 tracking). This describes intended capability, not current implementation or release readiness.

## Release proposition

Publish real lock-step ORSet, kernel and adapter packages and a versioned Wesley target, while keeping root consumers working. Applications gain reusable implementation and generation boundaries instead of private workspace shells or copied renderer recipes.

**Version boundary:** MINOR only if root exports, CLI, storage and supported types remain compatible. Any required public removal moves the affected work to a major release. Lower packages must be published and available before shipped root imports consume them.

## Capability boundary

### Before this release

Private workspace shells and an application-owned reference renderer do not constitute reusable published packages or a supported versioned compiler target. Root consumers must keep working while lower-level distribution boundaries become public.

### After this release

Consumers can install real lock-step ORSet, kernel, and adapter packages, while supported root imports remain compatible. A reusable versioned Wesley target generates supported validators, requests, Intents, and bounded Observers with deterministic output and explicit unsupported-mapping diagnostics.

### Still out of reach

The compiler does not invent application semantics, arbitrary domain decoders, or unbounded plans. Package extraction does not authorize public API removals, unpublished relative workspace imports, a separate tag scheme per package, or a universal browser playground.

## Exit invariants

- One repository release tag identifies synchronized public package versions and provenance ([#519](https://github.com/git-stunts/git-warp/issues/519)).
- A lower package is published, visible, and consumer-verified before shipped root imports require it. A private workspace shell is never used as a published dependency ([#517](https://github.com/git-stunts/git-warp/issues/517)/[#516](https://github.com/git-stunts/git-warp/issues/516)/[#515](https://github.com/git-stunts/git-warp/issues/515)).
- Each extraction is independently mergeable: the root package remains buildable and installable after every PR.
- Runtime-backed ORSet and port contracts are audited before public extraction. Constructor/compaction defects are fixed or the public boundary narrowed explicitly.
- Root exports, supported types, CLI, and storage remain compatible; otherwise affected work moves to a major boundary ([#116](https://github.com/git-stunts/git-warp/issues/116)).
- The Wesley target has a versioned descriptor/directive vocabulary, byte-stable regeneration, and stable diagnostics for unsupported or ambiguous mappings ([#828](https://github.com/git-stunts/git-warp/issues/828)).

## Scope

### Must ship

[#519](https://github.com/git-stunts/git-warp/issues/519) establishes the multi-package publication pipeline, followed by [#517](https://github.com/git-stunts/git-warp/issues/517) ORSet, [#516](https://github.com/git-stunts/git-warp/issues/516) kernel, and [#515](https://github.com/git-stunts/git-warp/issues/515) adapters. [#116](https://github.com/git-stunts/git-warp/issues/116) verifies exported type-only consumer imports. [#828](https://github.com/git-stunts/git-warp/issues/828) publishes the reusable generation target and installed-consumer evidence. All six are commitments.

### May slip

No issue is currently classified may-slip. Required compatibility defects discovered by package consumers must be incorporated into a coherent prerequisite or force a revised release boundary; they cannot be hidden as optional follow-up cleanup.

### Discovery

There are no discovery-classified cards, but two activation decisions remain mandatory: audit the actual CRDT/port export contract and confirm Wesley's supported external-target protocol/version. These are readiness checks inside the existing issues, not evidence that the implementation is already specified completely.

### Tracking

[#123](https://github.com/git-stunts/git-warp/issues/123) groups the public API catalog/browser documentation playground campaign. It is not a seventh executable PR or a promise to deliver an entire playground in this release. Complete it only if its own scope is satisfied; otherwise move it before release preparation.

### Explicitly out of scope

Private-shell imports in shipped artifacts; unvalidated public CRDT operations; compiler guesses about product meaning; independent package tag histories; incompatible root removals disguised as a minor; completion of future merge APIs merely to fill an API catalog.

## Workstreams

These are coordination and ownership groups, not extra issues or inferred dependency edges. Every inventory card belongs to exactly one group; one executable issue still maps to one coherent, independently verifiable PR.

| Key | Workstream and outcome | Associated issues |
| --- | --- | --- |
| packages | **Publishable package boundaries.** Ship the pipeline and extract lower packages in dependency order without breaking root consumers. | [#515](https://github.com/git-stunts/git-warp/issues/515), [#516](https://github.com/git-stunts/git-warp/issues/516), [#517](https://github.com/git-stunts/git-warp/issues/517), [#519](https://github.com/git-stunts/git-warp/issues/519) |
| consumers | **Supported imports and catalog tracking.** Prove the exported type surface and keep the optional broader documentation campaign separate. | [#116](https://github.com/git-stunts/git-warp/issues/116), [#123](https://github.com/git-stunts/git-warp/issues/123) |
| generation | **Versioned generated clients.** Publish a deterministic supported Wesley target with executable installed consumers. | [#828](https://github.com/git-stunts/git-warp/issues/828) |

## Dependency structure

The recorded extraction chain is [#519](https://github.com/git-stunts/git-warp/issues/519) → [#517](https://github.com/git-stunts/git-warp/issues/517) → [#516](https://github.com/git-stunts/git-warp/issues/516) → [#515](https://github.com/git-stunts/git-warp/issues/515), with direct pipeline requirements also recorded for [#516](https://github.com/git-stunts/git-warp/issues/516) and [#515](https://github.com/git-stunts/git-warp/issues/515). Publication availability is an additional delivery condition: merging a lower-package PR does not make its registry artifact exist.

[#116](https://github.com/git-stunts/git-warp/issues/116) can establish the root baseline before extraction, then run against every changed public surface. [#828](https://github.com/git-stunts/git-warp/issues/828) can prepare its explicit target contract against supported root APIs while package work proceeds; external Wesley protocol readiness remains unresolved until verified. There is no accepted edge making [#828](https://github.com/git-stunts/git-warp/issues/828) wait for every package extraction or future merge noun. Final convergence is the installed multi-package/root/target compatibility matrix.

This milestone has **5 incoming direct edges** in the accepted 79-edge graph. 0 originate in an earlier release. Version order is a release policy; absence of a task edge is not proof that contracts are independent.

The following direct prerequisites are generated from the accepted graph. An arrow means the blocker PR must already be integrated for the dependent PR to be correct; preparatory design or witness work may start earlier. "Accepted ownership" and scope reconciliation are planning decisions, not claims that all edges were present in the original reports. Transitive contractual edges are retained.

| Blocker | Dependent | Basis and reason |
| --- | --- | --- |
| [#516](https://github.com/git-stunts/git-warp/issues/516) | [#515](https://github.com/git-stunts/git-warp/issues/515) | previously accepted: Adapter extraction requires a real public kernel boundary and publish-safe dependency wiring.  Evidence: FLY-195 explicit prerequisite |
| [#517](https://github.com/git-stunts/git-warp/issues/517) | [#516](https://github.com/git-stunts/git-warp/issues/516) | previously accepted: Kernel extraction must consume a real public warp-orset dependency, not a private shell or relative path.  Evidence: FLY-196 explicit prerequisite |
| [#519](https://github.com/git-stunts/git-warp/issues/519) | [#515](https://github.com/git-stunts/git-warp/issues/515) | documented direct: Adapter publication consumes the lock-step release pipeline directly, in addition to the published kernel. [source 1](https://github.com/git-stunts/git-warp/issues/515) |
| [#519](https://github.com/git-stunts/git-warp/issues/519) | [#516](https://github.com/git-stunts/git-warp/issues/516) | documented direct: Kernel publication consumes the lock-step multi-package release pipeline directly, in addition to the published ORSet dependency. [source 1](https://github.com/git-stunts/git-warp/issues/516) |
| [#519](https://github.com/git-stunts/git-warp/issues/519) | [#517](https://github.com/git-stunts/git-warp/issues/517) | previously accepted: Publishing root imports of warp-orset requires multi-package release, dry-run and lock-step version support.  Evidence: FLY-197 explicit prerequisite; private workspace metadata verified |

## Release evidence

| Claim | Required release witness |
| --- | --- |
| Packages are real and coherent | Packed and registry-installed ORSet/kernel/adapter/root consumers, synchronized versions, export maps, dependency closure, and one immutable repository tag ([#519](https://github.com/git-stunts/git-warp/issues/519)/[#517](https://github.com/git-stunts/git-warp/issues/517)/[#516](https://github.com/git-stunts/git-warp/issues/516)/[#515](https://github.com/git-stunts/git-warp/issues/515)). |
| Every intermediate mainline works | A consumer installation after each extraction, with lower artifacts already available before root import switches. Private relative imports fail validation. |
| Types remain public and usable | Type-only imports and supported root/browser/JSR consumers from packed/published artifacts ([#116](https://github.com/git-stunts/git-warp/issues/116)); runtime tests validate the concepts the types describe. |
| Generation is deterministic and bounded | Fixed schema/config yields byte-identical output; unsupported/ambiguous directives and unbounded plans produce stable diagnostics ([#828](https://github.com/git-stunts/git-warp/issues/828)). |
| Generated clients execute | Consumer typecheck and packed-package execution against a disposable real-Git Runtime; no private application renderer is required. |

Record the Wesley protocol/target versions and supported directive subset. All consumer execution and benchmarks use COPY-based Docker; public publication itself follows the authorized release process.

These are required future release witnesses, not results produced by writing this plan. Link each result to its source commit, reproducible command, fixture/configuration, container image, and resulting integration commit. Use the [release procedure](../../../.github/RELEASE.md) and [release profile](../../../.continuum/release.yml) for the current commands and artifact checks. All tests and benchmarks execute in COPY-based Docker; never mount host repositories or Git directories.

## Risks and open questions

- Package boundaries may expose old constructor/port defects. Promote necessary debt into required prerequisites before extraction activation.
- Registry ordering and version drift can break otherwise green workspace builds. Installation outside the monorepo is mandatory evidence.
- The exact release/publish mechanics must follow the release profile; a new per-package tag strategy would require a separate decision.
- The Wesley integration is an external readiness dependency. A local renderer demo is not proof that the reusable protocol is supported.
- A necessary public removal would invalidate the minor-version thesis.

## Slip policy

None of the six committed issues can slip without narrowing the proposition. The [#123](https://github.com/git-stunts/git-warp/issues/123) container may move. If preserving root compatibility proves impossible, move the affected extraction to a major release and revise milestone assignments before implementation continues; do not leave consumers waiting for a later repair PR.

Before release preparation, complete or explicitly move every unfinished candidate, discovery, and container to an appropriate later release home in both trackers; update affected prerequisites and regenerate this inventory. The [release guard](../../../scripts/release-guard.sh) requires zero open non-`type:release` issues in the target milestone and zero open issues in prior version milestones. It also checks repository-wide `priority:asap` work. A prose "may slip" category never bypasses those gates. Required work cannot be removed merely to make the count zero.

## Completion criteria

The milestone is complete only when every applicable condition below is true; missing evidence is an unmet condition.

- The pipeline and all three lower packages are published and verified in the required order; root consumers work after every integration.
- Type-only, runtime, browser, and JSR acceptance agree with the declared support matrix.
- The versioned Wesley target is installable, regenerates deterministically, rejects unsupported mappings, and executes supported generated clients.
- No shipped import resolves into an unpublished private shell; the release remains compatible with the v21 root contract.
- Every selected executable issue links one coherent PR and its resulting mainline integration commit, with issue-specific acceptance evidence; tracking parents add no duplicate implementation credit.
- Required label axes, milestone assignments, prerequisite disposition, and the actual release guard pass; unselected work is rehomed before release preparation.
- Required CI, compatibility and Docker witnesses pass on the exact release source. Metadata, changelog, architecture, topics, and operator guidance describe what shipped.
- The normal release process completes review, immutable tagging, registry verification, and the post-release retrospective before the next train activates. This plan does not itself authorize merging or publication.

## Issue inventory

<!-- BEGIN GENERATED ISSUE INVENTORY -->
Generated from the GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific). This is the complete **7-issue planning inventory** for this milestone, not a live completion counter. Titles retain tracker wording, including historical names; each linked issue's current scope/disposition governs implementation.

Every issue has one release home, one commitment category, and one workstream below. A dash in prerequisites means no accepted open-issue prerequisite in this graph; it does not establish independence. Earlier-release prerequisites remain visible.

### Must ship (6)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#116](https://github.com/git-stunts/git-warp/issues/116) — Consumer Test Type-Only Import Coverage | [FLY-8](https://linear.app/flyingrobots/issue/FLY-8/consumer-test-type-only-import-coverage) | consumers | — |
| [#515](https://github.com/git-stunts/git-warp/issues/515) — Extract warp-adapters as a real published workspace package | [FLY-195](https://linear.app/flyingrobots/issue/FLY-195/extract-warp-adapters-as-a-real-published-workspace-package) | packages | [#516](https://github.com/git-stunts/git-warp/issues/516), [#519](https://github.com/git-stunts/git-warp/issues/519) |
| [#516](https://github.com/git-stunts/git-warp/issues/516) — Extract warp-kernel as a real published workspace package | [FLY-196](https://linear.app/flyingrobots/issue/FLY-196/extract-warp-kernel-as-a-real-published-workspace-package) | packages | [#517](https://github.com/git-stunts/git-warp/issues/517), [#519](https://github.com/git-stunts/git-warp/issues/519) |
| [#517](https://github.com/git-stunts/git-warp/issues/517) — Extract warp-orset as a real published workspace package | [FLY-197](https://linear.app/flyingrobots/issue/FLY-197/extract-warp-orset-as-a-real-published-workspace-package) | packages | [#519](https://github.com/git-stunts/git-warp/issues/519) |
| [#519](https://github.com/git-stunts/git-warp/issues/519) — Design and implement the multi-package release pipeline | [FLY-198](https://linear.app/flyingrobots/issue/FLY-198/design-and-implement-the-multi-package-release-pipeline) | packages | — |
| [#828](https://github.com/git-stunts/git-warp/issues/828) — COOL IDEA™: publish a reusable Wesley target for generated domain SDKs | [FLY-240](https://linear.app/flyingrobots/issue/FLY-240/cool-ideatm-publish-a-reusable-wesley-target-for-generated-domain-sdks) | generation | — |

### Required disposition (0)

None assigned in this snapshot.

### May slip (0)

None assigned in this snapshot.

### Discovery (0)

None assigned in this snapshot.

### Tracking (1)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#123](https://github.com/git-stunts/git-warp/issues/123) — Public API Catalog And Browser Documentation Playground | [FLY-15](https://linear.app/flyingrobots/issue/FLY-15/public-api-catalog-and-browser-documentation-playground) | consumers | — |

<!-- END GENERATED ISSUE INVENTORY -->
