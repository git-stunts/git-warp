# v20.0.0 — Memory safety and usable public attachments

Planning status: accepted delivery plan for the [v20.0.0 milestone](https://github.com/git-stunts/git-warp/milestone/14) and matching milestone in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452). Owner: James Ross. No target date is assigned. [All release plans](../README.md).

Snapshot: 2026-10-01 Pacific; source baseline `94b40dac64034cd8caab9bb05efe14a0c22bd735`. Live issue homes/titles and recorded GitHub prerequisites were reconciled with Linear at `2026-10-02T04:24:27.613318+00:00`. Historical inventory: **23 cards** (21 must ship; 1 required disposition; 1 tracking), with commitment categories corrected by the maintainer on 2026-10-02. Later-assigned milestone issues are also mandatory; this historical inventory is not a scope ceiling. This describes intended capability, not current implementation or release readiness.

## Release proposition

Make the next mainline release safe to allocate, validate, test and consume: fix producer allocation defects and current correctness failures, restore supported node/edge byte attachments, and publish the lifecycle/interpretation changes already merged on main under an honest major version. Application consumers gain verified attach/replace/clear/stream operations instead of private API workarounds.

**Version boundary:** MAJOR: main already contains breaking lifecycle/interpretation semantics ([#876](https://github.com/git-stunts/git-warp/issues/876), [#893](https://github.com/git-stunts/git-warp/issues/893), [#910](https://github.com/git-stunts/git-warp/issues/910)). Reconcile metadata, interpretation/migration guidance and supported consumer behavior before publication. This supersedes the unshippable v19.2.0 minor plan.

## Capability boundary

### Before this release

The planning baseline is main `94b40dac`, with npm v19.1.0 as the published stable baseline recorded by the roadmap audit. Main already contains lifecycle and interpretation changes integrated through [#889](https://github.com/git-stunts/git-warp/issues/889), including [#893](https://github.com/git-stunts/git-warp/issues/893)/[#910](https://github.com/git-stunts/git-warp/issues/910). Publishing that source as the abandoned v19.2.0 minor would misstate compatibility.

Application consumers still need supported node/edge attachment operations and installed-package proof. Existing memory and membership containment does not prove that every producer allocation, shutdown path, or low-level compaction operation is safe.

### After this release

A consumer can attach, replace, clear, inspect metadata, and stream byte content on both nodes and edges through supported public APIs. Oversized atomic descriptors are refused before expensive full encoding; stale additions cannot resurrect removed membership through unsafe compaction. Current provider failures and allocation/test-harness defects have reproducible dispositions.

The release explains the already-integrated breaking lifecycle boundary, ships consistent artifacts, and demonstrates registry installation and attachment use from those artifacts.

### Still out of reach

A complete graph may still encounter the legacy retained-state architecture. This release does not establish memory bounds for every global graph operation, migrate to indexed retained roots, execute recursive WARP traversal, or implement reversible braid collapse. The structural ownership contract is defined here; recursive execution arrives in v21.0.0.

## Exit invariants

- Rejected oversized input publishes no partial intent and does not first allocate its full encoded representation ([#916](https://github.com/git-stunts/git-warp/issues/916)).
- Byte attachment streams have explicit collection limits, cancellation, failure, and atomic publication behavior. Metadata never implies content was fully loaded ([#818](https://github.com/git-stunts/git-warp/issues/818), [#901](https://github.com/git-stunts/git-warp/issues/901)).
- Attach/replace/clear has the same observable contract for supported node and edge consumers; installed artifacts expose it without private imports ([#902](https://github.com/git-stunts/git-warp/issues/902), [#904](https://github.com/git-stunts/git-warp/issues/904)).
- Finite structural ownership, descendant-preserving mutation, and external/live references remain distinct ([#903](https://github.com/git-stunts/git-warp/issues/903)).
- Membership containment survives stale merges; genuinely concurrent additions remain valid. A local applied frontier is not evidence of global causal stability ([#911](https://github.com/git-stunts/git-warp/issues/911)).
- The [#894](https://github.com/git-stunts/git-warp/issues/894) hypothesis receives a deterministic disposition; source inspection alone neither confirms nor disproves it.
- Provider results use the authoritative failure vocabulary and satisfy the four recorded neighbor contracts ([#895](https://github.com/git-stunts/git-warp/issues/895), [#913](https://github.com/git-stunts/git-warp/issues/913)).
- Test execution stays inside COPY-based Docker; a frozen dependency install and bounded validator shutdown are part of reproducible delivery.

## Scope

### Must ship

The original 13 implementation commitments are [#818](https://github.com/git-stunts/git-warp/issues/818), [#865](https://github.com/git-stunts/git-warp/issues/865), [#870](https://github.com/git-stunts/git-warp/issues/870), [#882](https://github.com/git-stunts/git-warp/issues/882), [#891](https://github.com/git-stunts/git-warp/issues/891), [#895](https://github.com/git-stunts/git-warp/issues/895), [#901](https://github.com/git-stunts/git-warp/issues/901), [#902](https://github.com/git-stunts/git-warp/issues/902), [#903](https://github.com/git-stunts/git-warp/issues/903), [#904](https://github.com/git-stunts/git-warp/issues/904), [#911](https://github.com/git-stunts/git-warp/issues/911), [#913](https://github.com/git-stunts/git-warp/issues/913), and [#916](https://github.com/git-stunts/git-warp/issues/916). They cover allocation/retention safety, supported byte attachments, contract correctness, and the delivery environment. [#894](https://github.com/git-stunts/git-warp/issues/894) additionally requires a fix if reproduced, or closure with a deterministic disproof and an explanation of what the witness covers.

[#876](https://github.com/git-stunts/git-warp/issues/876) owns release coordination and artifact closure; it is not a fourteenth implementation feature. PR [#914](https://github.com/git-stunts/git-warp/issues/914) (hooks) and PR [#915](https://github.com/git-stunts/git-warp/issues/915) (Docker isolation) must satisfy normal review and CI before dependent delivery work. Their inclusion is a delivery gate, not an invented edge from every issue to a PR.

### Additional required work

[#118](https://github.com/git-stunts/git-warp/issues/118)/[#125](https://github.com/git-stunts/git-warp/issues/125) improve cross-runtime installation evidence and guidance; [#189](https://github.com/git-stunts/git-warp/issues/189)/[#205](https://github.com/git-stunts/git-warp/issues/205) harden constructor inputs; [#221](https://github.com/git-stunts/git-warp/issues/221) removes global in-memory adapter state; [#706](https://github.com/git-stunts/git-warp/issues/706) reduces sequential guard I/O; [#869](https://github.com/git-stunts/git-warp/issues/869) publishes the session-retention proof; [#900](https://github.com/git-stunts/git-warp/issues/900) repairs the older symlinked migration entry point. All eight are required release commitments. They have the same completion and merge requirements as the original implementation set. Every subsequently assigned milestone issue is also required, including registry consumer isolation in [#922](https://github.com/git-stunts/git-warp/issues/922).

### May slip

None. The release waits until all assigned work is complete and all required implementation changes are merged.

### Discovery

There are no discovery-classified cards in this milestone. The uncertain liveness report [#894](https://github.com/git-stunts/git-warp/issues/894) is a required disposition, not optional research. Establish its actual checkpoint/tail behavior with a deterministic witness before choosing a fix.

### Tracking

[#876](https://github.com/git-stunts/git-warp/issues/876) is the single release container. Broader streaming/attachment trackers [#565](https://github.com/git-stunts/git-warp/issues/565)/[#824](https://github.com/git-stunts/git-warp/issues/824)/[#905](https://github.com/git-stunts/git-warp/issues/905) remain in v21.0.0 and must not duplicate this release's implementation ownership.

### Explicitly out of scope

Indexed retained manifests and root commitments; complete recursive graph references/traversal/retention; public package extraction; merge/unmerge; changes to a consumer's production repository. Do not claim that all graph memory growth is fixed when only the declared producer, lifecycle, and attachment paths have been proved.

## Workstreams

These are coordination and ownership groups, not extra issues or inferred dependency edges. Every inventory card belongs to exactly one group; one executable issue still maps to one coherent, independently verifiable PR.

| Key | Workstream and outcome | Associated issues |
| --- | --- | --- |
| safety | **Allocation and CRDT safety.** Refuse oversized producers, preserve causal evidence, and distinguish reproduced defects from hypotheses. | [#189](https://github.com/git-stunts/git-warp/issues/189), [#205](https://github.com/git-stunts/git-warp/issues/205), [#221](https://github.com/git-stunts/git-warp/issues/221), [#894](https://github.com/git-stunts/git-warp/issues/894), [#911](https://github.com/git-stunts/git-warp/issues/911), [#916](https://github.com/git-stunts/git-warp/issues/916) |
| attachments | **Public byte attachments.** Deliver supported operations, the ownership law, installed consumers, and truthful examples. | [#818](https://github.com/git-stunts/git-warp/issues/818), [#901](https://github.com/git-stunts/git-warp/issues/901), [#902](https://github.com/git-stunts/git-warp/issues/902), [#903](https://github.com/git-stunts/git-warp/issues/903), [#904](https://github.com/git-stunts/git-warp/issues/904) |
| contracts | **Provider and authority behavior.** Repair provider contracts; deliver required guard-I/O and authority-retention evidence without expanding the core attachment scope. | [#706](https://github.com/git-stunts/git-warp/issues/706), [#869](https://github.com/git-stunts/git-warp/issues/869), [#895](https://github.com/git-stunts/git-warp/issues/895), [#913](https://github.com/git-stunts/git-warp/issues/913) |
| delivery | **Reproducible delivery and release.** Land hook/isolation prerequisites, stabilize verification, and close the major release through normal registry gates. | [#118](https://github.com/git-stunts/git-warp/issues/118), [#125](https://github.com/git-stunts/git-warp/issues/125), [#865](https://github.com/git-stunts/git-warp/issues/865), [#870](https://github.com/git-stunts/git-warp/issues/870), [#876](https://github.com/git-stunts/git-warp/issues/876), [#882](https://github.com/git-stunts/git-warp/issues/882), [#891](https://github.com/git-stunts/git-warp/issues/891), [#900](https://github.com/git-stunts/git-warp/issues/900) |

## Dependency structure

The public attachment path is [#818](https://github.com/git-stunts/git-warp/issues/818) → [#901](https://github.com/git-stunts/git-warp/issues/901) → [#902](https://github.com/git-stunts/git-warp/issues/902), with [#901](https://github.com/git-stunts/git-warp/issues/901) and [#903](https://github.com/git-stunts/git-warp/issues/903) converging at [#904](https://github.com/git-stunts/git-warp/issues/904). [#870](https://github.com/git-stunts/git-warp/issues/870) precedes the final [#869](https://github.com/git-stunts/git-warp/issues/869) retention publication. The [#916](https://github.com/git-stunts/git-warp/issues/916) allocation guard, [#911](https://github.com/git-stunts/git-warp/issues/911) membership safety, and [#895](https://github.com/git-stunts/git-warp/issues/895)/[#913](https://github.com/git-stunts/git-warp/issues/913) provider work have no recorded mutual prerequisite; review their touched contracts before scheduling them as independent PRs.

[#903](https://github.com/git-stunts/git-warp/issues/903) and [#818](https://github.com/git-stunts/git-warp/issues/818) are foundations for later recursive storage/migration, [#916](https://github.com/git-stunts/git-warp/issues/916) for bounded bulk ingestion, and [#911](https://github.com/git-stunts/git-warp/issues/911) for v21.1.0 compaction receipts. Those future consumers do not delay the narrow v20.0.0 implementation. Final convergence is the [#876](https://github.com/git-stunts/git-warp/issues/876) release-source and installed-consumer evidence set.

This milestone has **7 incoming direct edges** in the accepted 79-edge graph. 0 originate in an earlier release. Version order is a release policy; absence of a task edge is not proof that contracts are independent.

The following direct prerequisites are generated from the accepted graph. An arrow means the blocker PR must already be integrated for the dependent PR to be correct; preparatory design or witness work may start earlier. "Accepted ownership" and scope reconciliation are planning decisions, not claims that all edges were present in the original reports. Transitive contractual edges are retained.

| Blocker | Dependent | Basis and reason |
| --- | --- | --- |
| [#818](https://github.com/git-stunts/git-warp/issues/818) | [#901](https://github.com/git-stunts/git-warp/issues/901) | previously accepted: The restored public API must ship stream-only reads, bounded inline values and cancellation/size guarantees. Land the internal stream contract before exposing its public intents; minimum consumer proof stays in [#901](https://github.com/git-stunts/git-warp/issues/901).  Evidence: [#901](https://github.com/git-stunts/git-warp/issues/901) Scope and Implementation sequencing; [#818](https://github.com/git-stunts/git-warp/issues/818) Outcome and Acceptance |
| [#818](https://github.com/git-stunts/git-warp/issues/818) | [#902](https://github.com/git-stunts/git-warp/issues/902) | explicit-contract: The consumer acceptance card explicitly coordinates with [#818](https://github.com/git-stunts/git-warp/issues/818) and checks streaming reads, cancellation, size mismatch and atomicity. Preserve this direct contract prerequisite even though [#818](https://github.com/git-stunts/git-warp/issues/818) -> [#901](https://github.com/git-stunts/git-warp/issues/901) -> [#902](https://github.com/git-stunts/git-warp/issues/902) already orders it. [source 1](https://github.com/git-stunts/git-warp/issues/818) [source 2](https://github.com/git-stunts/git-warp/issues/902) |
| [#870](https://github.com/git-stunts/git-warp/issues/870) | [#869](https://github.com/git-stunts/git-warp/issues/869) | documented delivery: The implementation owner reports that the required pre-push Mermaid gate hangs on browser shutdown and prevents publication of this conformance work. This is a documented delivery prerequisite, not a general blocker on every PR. [source 1](https://github.com/git-stunts/git-warp/issues/869#issuecomment-5409093364) |
| [#901](https://github.com/git-stunts/git-warp/issues/901) | [#902](https://github.com/git-stunts/git-warp/issues/902) | previously accepted: A green installed-package acceptance gate requires the supported node/edge attachment API. Minimum packed-consumer regressions still ship with FLY-256; FLY-257 completes the broader required gate.  Evidence: FLY-256 acceptance; FLY-257 consumer acceptance scope |
| [#901](https://github.com/git-stunts/git-warp/issues/901) | [#904](https://github.com/git-stunts/git-warp/issues/904) | previously accepted: The complete documentation card requires executable supported-package attach/replace/clear/stream examples. Honesty corrections can start now, but the card cannot finish while those operations are missing.  Evidence: [#904](https://github.com/git-stunts/git-warp/issues/904) Acceptance bullets 1, 3, 4, 7 |
| [#902](https://github.com/git-stunts/git-warp/issues/902) | [#904](https://github.com/git-stunts/git-warp/issues/904) | accepted-ownership: Assign reusable installed-package attachment operation examples and their execution harness to [#902](https://github.com/git-stunts/git-warp/issues/902). [#904](https://github.com/git-stunts/git-warp/issues/904) publishes and runs those examples with the documented history, cancellation and retention behavior; it does not create a second unverified consumer recipe. [source 1](https://github.com/git-stunts/git-warp/issues/902) [source 2](https://github.com/git-stunts/git-warp/issues/904) |
| [#903](https://github.com/git-stunts/git-warp/issues/903) | [#904](https://github.com/git-stunts/git-warp/issues/904) | previously accepted: The documentation must distinguish finite structural ownership from byte assets and external/live references using the agreed ownership and descendant-mutation contract. Current-capability corrections can land early.  Evidence: [#904](https://github.com/git-stunts/git-warp/issues/904) Acceptance bullet 2; [#903](https://github.com/git-stunts/git-warp/issues/903) Scope and Acceptance |

## Release evidence

| Claim | Required release witness |
| --- | --- |
| Allocation refusal is early | Generated oversized atomic descriptors, exact-boundary inputs, allocation/pull counters, and a calibrated eager negative control ([#916](https://github.com/git-stunts/git-warp/issues/916)). |
| Attachments are usable and bounded | Packed-package node/edge attach, replace, clear, metadata, and stream round trips; slow consumers, cancellation, size mismatch, and failed-publication cases ([#818](https://github.com/git-stunts/git-warp/issues/818), [#901](https://github.com/git-stunts/git-warp/issues/901), [#902](https://github.com/git-stunts/git-warp/issues/902)). |
| Membership is safe | Stale replay and concurrent re-add schedules across compaction/checkpoint round trips; explicit retained/refused retirement outcomes ([#911](https://github.com/git-stunts/git-warp/issues/911)). |
| Reported correctness gaps are resolved | The [#894](https://github.com/git-stunts/git-warp/issues/894) reproducer/disproof plus the four [#913](https://github.com/git-stunts/git-warp/issues/913) cases and [#895](https://github.com/git-stunts/git-warp/issues/895) failure-vocabulary checks. |
| Verification is reproducible | Frozen Bun Docker install, worker-starvation regression, bounded Mermaid shutdown, and review/CI evidence for [#914](https://github.com/git-stunts/git-warp/issues/914)/[#915](https://github.com/git-stunts/git-warp/issues/915). |
| The released package matches the claim | Exact-source preflight, synchronized metadata, registry identity/visibility, and installed supported consumers under [#876](https://github.com/git-stunts/git-warp/issues/876). |

Record heap/RSS limits, fixture dimensions, container image, source commit, and termination deadlines with the relevant witness. A green run without the negative control does not establish that the memory gate would catch eager buffering.

These are required future release witnesses, not results produced by writing this plan. Link each result to its source commit, reproducible command, fixture/configuration, container image, and resulting integration commit. Use the [release procedure](../../../.github/RELEASE.md) and [release profile](../../../.continuum/release.yml) for the current commands and artifact checks. All tests and benchmarks execute in COPY-based Docker; never mount host repositories or Git directories.

## Risks and open questions

- [#894](https://github.com/git-stunts/git-warp/issues/894) may describe a false hypothesis or a narrower defect; do not land a speculative semantic change to make a historical description true.
- Low-level compaction may still lack a safe retirement proof. Preservation or explicit refusal is acceptable; resurrecting stale membership is not.
- Attachment documentation can accidentally promise recursive execution from a byte-content API. Keep the [#903](https://github.com/git-stunts/git-warp/issues/903) contract and the v21.0.0 implementation boundary visible.
- Coverage worker starvation can mask source failures. Repair the harness without reducing the required verification surface.
- Already-merged major semantics require accurate upgrade guidance even though most new fixes are individually compatible.

## Slip policy

No assigned issue may slip. Complete and merge all implementation work with its acceptance evidence before publication. Do not move issues to later milestones, remove their release targets, or close unfinished work merely to clear the release gate. Only an explicit subsequent maintainer decision can change this scope.

[#894](https://github.com/git-stunts/git-warp/issues/894) still requires a deterministic fix or disproof under its stated acceptance criteria; disposition is required work, not deferral. Tracking and release cards must finish their stated closure work without creating duplicate implementation PRs. The [release guard](../../../scripts/release-guard.sh) continues to require zero open non-`type:release` issues in the target milestone and zero open prior-release issues, alongside its repository-wide urgent-work checks. Normal publication, registry verification and retrospective requirements remain in force.

## Completion criteria

The milestone is complete only when every applicable condition below is true; missing evidence is an unmet condition.

- Every assigned implementation issue is complete, integrated and independently verified; [#894](https://github.com/git-stunts/git-warp/issues/894) has its required disposition.
- Node and edge consumers pass the same public attachment matrix from the release artifact.
- Unsafe membership retirement is prevented and memory-negative controls demonstrate the declared gates are effective.
- [#876](https://github.com/git-stunts/git-warp/issues/876) links the reviewed release source, immutable tag, registry and consumer evidence, and completed retrospective. No later-release capability is claimed by the v20 documentation.
- Every assigned executable issue links one coherent PR and its resulting mainline integration commit, with issue-specific acceptance evidence; tracking parents add no duplicate implementation credit.
- Required label axes, milestone assignments, prerequisite disposition, and the actual release guard pass; no unfinished work is removed or rehomed to satisfy the gate.
- Required CI, compatibility and Docker witnesses pass on the exact release source. Metadata, changelog, architecture, topics, and operator guidance describe what shipped.
- The normal release process completes review, immutable tagging, registry verification, and the post-release retrospective before the next train activates. This plan does not itself authorize merging or publication.

## Issue inventory

<!-- BEGIN GENERATED ISSUE INVENTORY -->
Generated from the GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific). This is the original **23-issue planning inventory**, not the current complete milestone inventory or a live completion counter. The 2026-10-02 maintainer decision promotes all eight formerly optional cards to required work; all later-assigned milestone cards are required too. Titles retain tracker wording, including historical names; each linked issue's current scope/disposition governs implementation.

Every issue has one release home, one commitment category, and one workstream below. A dash in prerequisites means no accepted open-issue prerequisite in this graph; it does not establish independence. Earlier-release prerequisites remain visible.

### Must ship — original implementation set (13)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#818](https://github.com/git-stunts/git-warp/issues/818) — Make attachment APIs stream-only and bound all byte collection | [FLY-233](https://linear.app/flyingrobots/issue/FLY-233/make-attachment-apis-stream-only-and-bound-all-byte-collection) | attachments | — |
| [#865](https://github.com/git-stunts/git-warp/issues/865) — BAD CODE™: Bun Docker build silently discards the npm lock | [FLY-245](https://linear.app/flyingrobots/issue/FLY-245/bad-codetm-bun-docker-build-silently-discards-the-npm-lock) | delivery | — |
| [#870](https://github.com/git-stunts/git-warp/issues/870) — Bound Mermaid validator shutdown in the pre-push gate | [FLY-247](https://linear.app/flyingrobots/issue/FLY-247/bound-mermaid-validator-shutdown-in-the-pre-push-gate) | delivery | — |
| [#882](https://github.com/git-stunts/git-warp/issues/882) — Coverage instrumentation hits a worker-starvation cliff under load | [FLY-249](https://linear.app/flyingrobots/issue/FLY-249/coverage-instrumentation-hits-a-worker-starvation-cliff-under-load) | delivery | — |
| [#891](https://github.com/git-stunts/git-warp/issues/891) — postinstall sets core.hooksPath to an absolute path, hijacking every other worktree | [FLY-250](https://linear.app/flyingrobots/issue/FLY-250/postinstall-sets-corehookspath-to-an-absolute-path-hijacking-every) | delivery | — |
| [#895](https://github.com/git-stunts/git-warp/issues/895) — Failure cause checkpoint-basis-unavailable is not in the optic failure cause union | [FLY-252](https://linear.app/flyingrobots/issue/FLY-252/failure-cause-checkpoint-basis-unavailable-is-not-in-the-optic-failure) | contracts | — |
| [#901](https://github.com/git-stunts/git-warp/issues/901) — Restore public node and edge content attachments after the v19 API migration | [FLY-256](https://linear.app/flyingrobots/issue/FLY-256/restore-public-node-and-edge-content-attachments-after-the-v19-api) | attachments | [#818](https://github.com/git-stunts/git-warp/issues/818) |
| [#902](https://github.com/git-stunts/git-warp/issues/902) — Prove node and edge attachments through installed-package public APIs | [FLY-257](https://linear.app/flyingrobots/issue/FLY-257/prove-node-and-edge-attachments-through-installed-package-public-apis) | attachments | [#818](https://github.com/git-stunts/git-warp/issues/818), [#901](https://github.com/git-stunts/git-warp/issues/901) |
| [#903](https://github.com/git-stunts/git-warp/issues/903) — Define recursive attachment ownership and descendant-preserving mutation semantics | [FLY-258](https://linear.app/flyingrobots/issue/FLY-258/define-recursive-attachment-ownership-and-descendant-preserving) | attachments | — |
| [#904](https://github.com/git-stunts/git-warp/issues/904) — Correct public attachment documentation and publish executable capability examples | [FLY-259](https://linear.app/flyingrobots/issue/FLY-259/correct-public-attachment-documentation-and-publish-executable) | attachments | [#901](https://github.com/git-stunts/git-warp/issues/901), [#902](https://github.com/git-stunts/git-warp/issues/902), [#903](https://github.com/git-stunts/git-warp/issues/903) |
| [#911](https://github.com/git-stunts/git-warp/issues/911) — GC membership compaction can resurrect removed nodes when stale additions rejoin | [FLY-261](https://linear.app/flyingrobots/issue/FLY-261/gc-membership-compaction-can-resurrect-removed-nodes-when-stale) | safety | — |
| [#913](https://github.com/git-stunts/git-warp/issues/913) — Restore four failing neighbor-provider contract cases | [FLY-262](https://linear.app/flyingrobots/issue/FLY-262/restore-four-failing-neighbor-provider-contract-cases) | contracts | — |
| [#916](https://github.com/git-stunts/git-warp/issues/916) — Reject oversized atomic intent descriptors before full encoding allocation | [FLY-264](https://linear.app/flyingrobots/issue/FLY-264/reject-oversized-atomic-intent-descriptors-before-full-encoding) | safety | — |

### Required disposition (1)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#894](https://github.com/git-stunts/git-warp/issues/894) — Bounded node liveness read counts a tail add as live when a checkpoint remove observed its dot | [FLY-251](https://linear.app/flyingrobots/issue/FLY-251/bounded-node-liveness-read-counts-a-tail-add-as-live-when-a-checkpoint) | safety | — |

### Must ship — formerly optional set (8)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#118](https://github.com/git-stunts/git-warp/issues/118) — Deno Smoke Test | [FLY-10](https://linear.app/flyingrobots/issue/FLY-10/deno-smoke-test) | delivery | — |
| [#125](https://github.com/git-stunts/git-warp/issues/125) — Docs: README Install Section | [FLY-17](https://linear.app/flyingrobots/issue/FLY-17/docs-readme-install-section) | delivery | — |
| [#189](https://github.com/git-stunts/git-warp/issues/189) — ORSet and LWW have no constructor validation | [FLY-52](https://linear.app/flyingrobots/issue/FLY-52/orset-and-lww-have-no-constructor-validation) | safety | — |
| [#205](https://github.com/git-stunts/git-warp/issues/205) — VersionVector constructor accepts undefined entries | [FLY-58](https://linear.app/flyingrobots/issue/FLY-58/versionvector-constructor-accepts-undefined-entries) | safety | — |
| [#221](https://github.com/git-stunts/git-warp/issues/221) — InMemoryGraphAdapter has module-level mutable global state | [FLY-69](https://linear.app/flyingrobots/issue/FLY-69/inmemorygraphadapter-has-module-level-mutable-global-state) | safety | — |
| [#706](https://github.com/git-stunts/git-warp/issues/706) — bad-code: IntentController sequential guard I/O over-fetch | [FLY-222](https://linear.app/flyingrobots/issue/FLY-222/bad-code-intentcontroller-sequential-guard-io-over-fetch) | contracts | — |
| [#869](https://github.com/git-stunts/git-warp/issues/869) — Prove session-event retention across authority paths | [FLY-246](https://linear.app/flyingrobots/issue/FLY-246/prove-session-event-retention-across-authority-paths) | contracts | [#870](https://github.com/git-stunts/git-warp/issues/870) |
| [#900](https://github.com/git-stunts/git-warp/issues/900) — Legacy upgrade command exits 0 without running when invoked through a symlink | [FLY-255](https://linear.app/flyingrobots/issue/FLY-255/legacy-upgrade-command-exits-0-without-running-when-invoked-through-a) | delivery | — |

### Discovery (0)

None assigned in this snapshot.

### Tracking (1)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#876](https://github.com/git-stunts/git-warp/issues/876) — Release v20.0.0: memory safety, public attachments, and registry closure | [FLY-248](https://linear.app/flyingrobots/issue/FLY-248/release-v2000-memory-safety-public-attachments-and-registry-closure) | delivery | — |

<!-- END GENERATED ISSUE INVENTORY -->
