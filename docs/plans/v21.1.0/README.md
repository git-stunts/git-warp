# v21.1.0 — Safe retention and operational security

Planning status: proposed delivery plan for the accepted [v21.1.0 milestone](https://github.com/git-stunts/git-warp/milestone/17) and matching milestone in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452). Owner: James Ross. No target date is assigned. [All release plans](../README.md).

Snapshot: 2026-10-01 Pacific; source baseline `94b40dac64034cd8caab9bb05efe14a0c22bd735`. Live issue homes/titles and recorded GitHub prerequisites were reconciled with Linear at `2026-10-02T04:24:27.613318+00:00`. Inventory: **15 cards** (3 must ship; 6 may slip; 6 discovery). This describes intended capability, not current implementation or release readiness.

## Release proposition

Build on bounded retained roots to expose honest compaction receipts and improve deployment operations with graceful sync-server shutdown and OS-vault-backed trust signing-key provisioning. Retention behavior must preserve stale-replica safety and make guarantees inspectable.

**Version boundary:** MINOR: additive operations and receipts with existing persisted interpretation and public behavior preserved. Encryption/trailer format changes remain in the v21.0 major bucket unless separately proved compatible.

## Capability boundary

### Before this release

The release sequence assumes v21.0.0's bounded retained representation. [#911](https://github.com/git-stunts/git-warp/issues/911)'s earlier safety work prevents unsafe membership retirement, but the supported compaction receipt is still missing. Sync-server shutdown and trust signing-key provisioning still need explicit operational contracts and evidence.

### After this release

Operators can drain a sync server with bounded shutdown outcomes, provision trust signing keys through an injected vault-backed boundary, and inspect truthful immutable compaction receipts. Stale-replica safety remains intact; receipts describe actual retained/removed evidence rather than claiming a global stability proof.

### Still out of reach

This release does not establish global causal stability from a local version vector, remove arbitrary tombstones, redesign encrypted wire formats, manage every data-encryption key lifecycle, or introduce a universal reversible Witness.

## Exit invariants

- [#474](https://github.com/git-stunts/git-warp/issues/474) consumes [#911](https://github.com/git-stunts/git-warp/issues/911)'s actual safe retirement/preservation contract. Counts and retained/removed evidence in a receipt agree with the operation performed.
- Stale additions cannot resurrect removed members; genuinely concurrent additions survive checkpoint and merge schedules.
- Sync shutdown stops admission of new work and defines in-flight drain, timeout, refusal, and frontier behavior; no partial advancement is reported as complete ([#179](https://github.com/git-stunts/git-warp/issues/179)).
- Trust signing keys enter through an injected secret capability and vault adapter. Logs, CI evidence, and issue artifacts contain no key bytes ([#450](https://github.com/git-stunts/git-warp/issues/450)).
- Missing vault access, provisioning failure, or invalid signatures have explicit outcomes.
- Existing public contracts and persisted interpretation remain compatible; breaking encryption/trailer changes remain in a major plan.

## Scope

### Must ship

[#179](https://github.com/git-stunts/git-warp/issues/179) delivers graceful sync-server shutdown, [#450](https://github.com/git-stunts/git-warp/issues/450) supported trust signing-key provisioning, and [#474](https://github.com/git-stunts/git-warp/issues/474) a truthful compaction receipt after [#911](https://github.com/git-stunts/git-warp/issues/911). These three are independent operational outcomes except for the recorded earlier-release compaction prerequisite.

### May slip

[#129](https://github.com/git-stunts/git-warp/issues/129)/[#401](https://github.com/git-stunts/git-warp/issues/401) improve current operator guidance; [#180](https://github.com/git-stunts/git-warp/issues/180) injects the sync nonce source; [#236](https://github.com/git-stunts/git-warp/issues/236) repairs trust-service boundaries; [#406](https://github.com/git-stunts/git-warp/issues/406) adds consumer resilience policies; [#487](https://github.com/git-stunts/git-warp/issues/487) persists existing admission witnesses in CAS. These six may move. Required documentation for the three committed capabilities still ships within their own PRs even if the broader guide cards slip.

### Discovery

[#138](https://github.com/git-stunts/git-warp/issues/138) evaluates a validated-key cache against measured need; [#139](https://github.com/git-stunts/git-warp/issues/139)/[#140](https://github.com/git-stunts/git-warp/issues/140)/[#141](https://github.com/git-stunts/git-warp/issues/141)/[#142](https://github.com/git-stunts/git-warp/issues/142) assess specific doctor/trust coverage or schema triggers; [#452](https://github.com/git-stunts/git-warp/issues/452) reconciles the current encrypted-store/chunking owner. Do not implement stale adapter names or speculative caches just because the issues have release homes.

### Tracking

No tracking-only card is assigned. [#487](https://github.com/git-stunts/git-warp/issues/487) refers to existing admission evidence, not the future reversible Witness in [#484](https://github.com/git-stunts/git-warp/issues/484); the shared word "witness" creates no prerequisite.

### Explicitly out of scope

Global-stability claims based solely on local progress; unsafe membership removal; encryption/trailer breaks deferred from v21.0.0 without a new major decision; plaintext secret fallback; conflating signing-key provisioning with per-writer encryption envelopes.

## Workstreams

These are coordination and ownership groups, not extra issues or inferred dependency edges. Every inventory card belongs to exactly one group; one executable issue still maps to one coherent, independently verifiable PR.

| Key | Workstream and outcome | Associated issues |
| --- | --- | --- |
| retention | **Truthful compaction and persisted evidence.** Expose safe compaction receipts; optionally persist the existing admission witness family. | [#474](https://github.com/git-stunts/git-warp/issues/474), [#487](https://github.com/git-stunts/git-warp/issues/487) |
| shutdown | **Sync lifecycle and resilience.** Deliver bounded drain/timeout behavior and evaluate compatible nonce/resilience improvements. | [#179](https://github.com/git-stunts/git-warp/issues/179), [#180](https://github.com/git-stunts/git-warp/issues/180), [#406](https://github.com/git-stunts/git-warp/issues/406) |
| trust | **Trust provisioning and security contracts.** Integrate the vault boundary and reconcile conditional trust/schema/chunking work. | [#138](https://github.com/git-stunts/git-warp/issues/138), [#140](https://github.com/git-stunts/git-warp/issues/140), [#141](https://github.com/git-stunts/git-warp/issues/141), [#142](https://github.com/git-stunts/git-warp/issues/142), [#236](https://github.com/git-stunts/git-warp/issues/236), [#450](https://github.com/git-stunts/git-warp/issues/450), [#452](https://github.com/git-stunts/git-warp/issues/452) |
| operations | **Operator guidance and diagnostics.** Document current guarantees and add evidence where an actual diagnostic gap remains. | [#129](https://github.com/git-stunts/git-warp/issues/129), [#139](https://github.com/git-stunts/git-warp/issues/139), [#401](https://github.com/git-stunts/git-warp/issues/401) |

## Dependency structure

The accepted issue edge is earlier [#911](https://github.com/git-stunts/git-warp/issues/911) → [#474](https://github.com/git-stunts/git-warp/issues/474). Reconfirm the integrated retirement contract before writing receipt semantics. Shutdown and vault provisioning have no recorded mutual prerequisite; both may be prepared while receipt work consumes the established safety boundary.

The version sequence builds on bounded retained roots, but it does not manufacture edges from every operational card to every v21.0.0 card. [#129](https://github.com/git-stunts/git-warp/issues/129) need not precede [#401](https://github.com/git-stunts/git-warp/issues/401), [#180](https://github.com/git-stunts/git-warp/issues/180) need not precede [#179](https://github.com/git-stunts/git-warp/issues/179), and [#450](https://github.com/git-stunts/git-warp/issues/450) need not wait for encryption envelopes. Review concrete shared adapter contracts before scheduling independently.

This milestone has **1 incoming direct edges** in the accepted 79-edge graph. 1 originate in an earlier release. Version order is a release policy; absence of a task edge is not proof that contracts are independent.

The following direct prerequisites are generated from the accepted graph. An arrow means the blocker PR must already be integrated for the dependent PR to be correct; preparatory design or witness work may start earlier. "Accepted ownership" and scope reconciliation are planning decisions, not claims that all edges were present in the original reports. Transitive contractual edges are retained.

| Blocker | Dependent | Basis and reason |
| --- | --- | --- |
| [#911](https://github.com/git-stunts/git-warp/issues/911) (v20.0.0) | [#474](https://github.com/git-stunts/git-warp/issues/474) | previously accepted: Use this receipt feature only for a safe compaction contract: it must not turn the known unsafe membership retirement into a supported GC operation. Safety/admissible-merge semantics precede the advertised dotsRemoved receipt.  Evidence: [#474](https://github.com/git-stunts/git-warp/issues/474) shipping usage example; [#911](https://github.com/git-stunts/git-warp/issues/911) stale-replica resurrection and Acceptance |

## Release evidence

| Claim | Required release witness |
| --- | --- |
| Receipts tell the truth | Independent expected retained/removed counts, stale joins, concurrent additions, replay permutations, checkpoint round trips, and a broken-retirement control ([#474](https://github.com/git-stunts/git-warp/issues/474)). |
| Shutdown is bounded | Real protocol behavior with active connections, a stalled peer, repeated signals, empty workload, timeout, and a failure that cannot publish partial frontier advancement ([#179](https://github.com/git-stunts/git-warp/issues/179)). |
| Keys are provisioned safely | Supported vault-backed signing through public trust operations; explicitly provisioned CI credentials; unavailable/locked/missing-key and invalid-signature outcomes; artifact/log checks for disclosure ([#450](https://github.com/git-stunts/git-warp/issues/450)). |
| Optional witness storage is compatible | If selected, bounded encode/lazy restore of existing admission evidence through CAS with missing/corrupt content outcomes ([#487](https://github.com/git-stunts/git-warp/issues/487)). |

Use COPY-based Docker for all test and benchmark execution. Resolve the supported OS-vault/CI provisioning matrix before claiming platform acceptance; mocks alone do not demonstrate native vault integration.

These are required future release witnesses, not results produced by writing this plan. Link each result to its source commit, reproducible command, fixture/configuration, container image, and resulting integration commit. Use the [release procedure](../../../.github/RELEASE.md) and [release profile](../../../.continuum/release.yml) for the current commands and artifact checks. All tests and benchmarks execute in COPY-based Docker; never mount host repositories or Git directories.

## Risks and open questions

- [#911](https://github.com/git-stunts/git-warp/issues/911) may only justify preservation/refusal. [#474](https://github.com/git-stunts/git-warp/issues/474) must describe that actual result instead of promising safe retirement it cannot establish.
- A container may not expose a host OS vault. The supported platform integration and reproducible provisioning path are an activation decision, not permission to mount secrets or run host tests.
- Shutdown races can appear only with real connection behavior; signal-handler unit tests alone are insufficient.
- Optional retention/security work can introduce incompatible formats. Compatibility is a gate for this minor.

## Slip policy

The six candidates and six discoveries can move. Required shutdown semantics, key provisioning, and truthful compaction receipts cannot be deferred without revising the proposition. If native-vault integration cannot be proved under the agreed isolation constraints, record the unresolved platform boundary and keep [#450](https://github.com/git-stunts/git-warp/issues/450) open; do not replace its acceptance with an unlabelled mock.

Before release preparation, complete or explicitly move every unfinished candidate, discovery, and container to an appropriate later release home in both trackers; update affected prerequisites and regenerate this inventory. The [release guard](../../../scripts/release-guard.sh) requires zero open non-`type:release` issues in the target milestone and zero open issues in prior version milestones. It also checks repository-wide `priority:asap` work. A prose "may slip" category never bypasses those gates. Required work cannot be removed merely to make the count zero.

## Completion criteria

The milestone is complete only when every applicable condition below is true; missing evidence is an unmet condition.

- All three must-ship operations have supported public/operational witnesses on the release source.
- Stale-replica safety and compaction receipt accounting agree; no global-stability guarantee is invented.
- Shutdown drain/timeout and vault failure/provisioning matrices have explicit supported outcomes and reproducible evidence.
- Compatible operator documentation distinguishes signing keys, data encryption, and causal retention guarantees.
- Every selected executable issue links one coherent PR and its resulting mainline integration commit, with issue-specific acceptance evidence; tracking parents add no duplicate implementation credit.
- Required label axes, milestone assignments, prerequisite disposition, and the actual release guard pass; unselected work is rehomed before release preparation.
- Required CI, compatibility and Docker witnesses pass on the exact release source. Metadata, changelog, architecture, topics, and operator guidance describe what shipped.
- The normal release process completes review, immutable tagging, registry verification, and the post-release retrospective before the next train activates. This plan does not itself authorize merging or publication.

## Issue inventory

<!-- BEGIN GENERATED ISSUE INVENTORY -->
Generated from the GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific). This is the complete **15-issue planning inventory** for this milestone, not a live completion counter. Titles retain tracker wording, including historical names; each linked issue's current scope/disposition governs implementation.

Every issue has one release home, one commitment category, and one workstream below. A dash in prerequisites means no accepted open-issue prerequisite in this graph; it does not establish independence. Earlier-release prerequisites remain visible.

### Must ship (3)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#179](https://github.com/git-stunts/git-warp/issues/179) — HTTP sync server has no graceful shutdown | [FLY-46](https://linear.app/flyingrobots/issue/FLY-46/http-sync-server-has-no-graceful-shutdown) | shutdown | — |
| [#450](https://github.com/git-stunts/git-warp/issues/450) — Use @git-stunts/vault for trust signing keys | [FLY-159](https://linear.app/flyingrobots/issue/FLY-159/use-git-stuntsvault-for-trust-signing-keys) | trust | — |
| [#474](https://github.com/git-stunts/git-warp/issues/474) — ORSet.compact() returns CompactionReceipt | [FLY-181](https://linear.app/flyingrobots/issue/FLY-181/orsetcompact-returns-compactionreceipt) | retention | [#911](https://github.com/git-stunts/git-warp/issues/911) |

### Required disposition (0)

None assigned in this snapshot.

### May slip (6)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#129](https://github.com/git-stunts/git-warp/issues/129) — Docs: SECURITY_SYNC.md | [FLY-21](https://linear.app/flyingrobots/issue/FLY-21/docs-security-syncmd) | operations | — |
| [#180](https://github.com/git-stunts/git-warp/issues/180) — SyncAuthService uses crypto.randomUUID for HMAC nonce | [FLY-47](https://linear.app/flyingrobots/issue/FLY-47/syncauthservice-uses-cryptorandomuuid-for-hmac-nonce) | shutdown | — |
| [#236](https://github.com/git-stunts/git-warp/issues/236) — TrustRecordService has multiple code smells | [FLY-78](https://linear.app/flyingrobots/issue/FLY-78/trustrecordservice-has-multiple-code-smells) | trust | — |
| [#401](https://github.com/git-stunts/git-warp/issues/401) — Expand ADVANCED_GUIDE.md with trust, performance, and checkpoints | [FLY-117](https://linear.app/flyingrobots/issue/FLY-117/expand-advanced-guidemd-with-trust-performance-and-checkpoints) | operations | — |
| [#406](https://github.com/git-stunts/git-warp/issues/406) — User-Supplied Resilience Policies via Alfred | [FLY-121](https://linear.app/flyingrobots/issue/FLY-121/user-supplied-resilience-policies-via-alfred) | shutdown | — |
| [#487](https://github.com/git-stunts/git-warp/issues/487) — Content-addressed witnesses in git-cas | [FLY-191](https://linear.app/flyingrobots/issue/FLY-191/content-addressed-witnesses-in-git-cas) | retention | — |

### Discovery (6)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#138](https://github.com/git-stunts/git-warp/issues/138) — `TrustKeyStore` Pre-Validated Key Cache | [FLY-30](https://linear.app/flyingrobots/issue/FLY-30/trustkeystore-pre-validated-key-cache) | trust | — |
| [#139](https://github.com/git-stunts/git-warp/issues/139) — Doctor: Property-Based Fuzz Test | [FLY-31](https://linear.app/flyingrobots/issue/FLY-31/doctor-property-based-fuzz-test) | operations | — |
| [#140](https://github.com/git-stunts/git-warp/issues/140) — Trust Record Round-Trip Snapshot Test | [FLY-32](https://linear.app/flyingrobots/issue/FLY-32/trust-record-round-trip-snapshot-test) | trust | — |
| [#141](https://github.com/git-stunts/git-warp/issues/141) — Trust Schema Discriminated Union | [FLY-33](https://linear.app/flyingrobots/issue/FLY-33/trust-schema-discriminated-union) | trust | — |
| [#142](https://github.com/git-stunts/git-warp/issues/142) — `unsignedRecordForId` Edge-Case Tests | [FLY-34](https://linear.app/flyingrobots/issue/FLY-34/unsignedrecordforid-edge-case-tests) | trust | — |
| [#452](https://github.com/git-stunts/git-warp/issues/452) — Switch encrypted stores to fixed chunking | [FLY-161](https://linear.app/flyingrobots/issue/FLY-161/switch-encrypted-stores-to-fixed-chunking) | trust | — |

### Tracking (0)

None assigned in this snapshot.

<!-- END GENERATED ISSUE INVENTORY -->
