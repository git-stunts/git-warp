# v20.1.0 — Observable causal histories

Planning status: proposed delivery plan for the accepted [v20.1.0 milestone](https://github.com/git-stunts/git-warp/milestone/15) and matching milestone in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452). Owner: James Ross. No target date is assigned. [All release plans](../README.md).

Snapshot: 2026-10-01 Pacific; source baseline `94b40dac64034cd8caab9bb05efe14a0c22bd735`. Live issue homes/titles and recorded GitHub prerequisites were reconciled with Linear at `2026-10-02T04:24:27.613318+00:00`. Inventory: **16 cards** (5 must ship; 6 may slip; 5 discovery). This describes intended capability, not current implementation or release readiness.

## Release proposition

Add restart-stable occurrence relations, materialization-free provenance readings and explainable query/admission behavior so applications and operators can inspect what happened and why. Build on the released v20 boundary with compatible, bounded public observation capabilities.

**Version boundary:** MINOR: retain v20 public signatures, interpretation semantics and storage compatibility. A candidate needing a breaking contract moves to the next major instead of silently changing this release type.

## Capability boundary

### Before this release

Assume v20.0.0's lifecycle, membership, and public byte-attachment boundary has shipped. Occurrences can be admitted and payloads retained, but an independent process lacks the complete supported occurrence-rehydration and causal-pair reading promised by [#854](https://github.com/git-stunts/git-warp/issues/854). Provenance and query strategy are not yet uniformly inspectable through bounded public readings and adapters.

### After this release

Applications can reopen opaque occurrence references at a named Lane/basis, ask whether a pair is same/before/after/concurrent, and distinguish that relation from deterministic display order. Consumers can trace admitted support through a materialization-free provenance reading and its CLI/MCP explanation. Query explanation reports the actual execution strategy, basis, cost evidence, and completeness using one operational vocabulary.

### Still out of reach

This is not a storage migration, occurrence enumeration service, universal debugger, or implementation of future merge outcomes. Explainability does not make an existing unbounded runtime path bounded: report it honestly, and never add a hidden full-state fallback to satisfy a bounded reading.

## Exit invariants

- Restart does not change retained causal relationships. Reversing a pair swaps before/after, preserves concurrency, and treats display order separately ([#854](https://github.com/git-stunts/git-warp/issues/854)).
- Missing, malformed, unreachable, and wrong-Lane references yield typed outcomes with bounded evidence, never a fabricated complete answer.
- Provenance names its reading basis, bounds/cursor, and support completeness; it does not require a fully cached graph ([#473](https://github.com/git-stunts/git-warp/issues/473)).
- CLI/MCP explanations consume that authoritative reading rather than reconstructing a competing history ([#421](https://github.com/git-stunts/git-warp/issues/421)).
- Explain output describes measured execution and support posture. An async iterable wrapped around full collection cannot report bounded execution ([#392](https://github.com/git-stunts/git-warp/issues/392), [#395](https://github.com/git-stunts/git-warp/issues/395)).
- Existing v20 public signatures, persisted interpretation, receipt meanings, and failure contracts remain compatible.

## Scope

### Must ship

[#854](https://github.com/git-stunts/git-warp/issues/854) delivers restart-stable occurrence relations. [#473](https://github.com/git-stunts/git-warp/issues/473) provides basis-owned provenance; [#421](https://github.com/git-stunts/git-warp/issues/421) projects it as supported admission-history explanation. [#392](https://github.com/git-stunts/git-warp/issues/392) defines the operational vocabulary and [#395](https://github.com/git-stunts/git-warp/issues/395) exposes actual strategy/cost evidence. These five are the release commitment.

### May slip

[#126](https://github.com/git-stunts/git-warp/issues/126) documents readonly receipt arrays; [#274](https://github.com/git-stunts/git-warp/issues/274) adds conflict-resolution counters; [#394](https://github.com/git-stunts/git-warp/issues/394) fuzzes query cursors; [#466](https://github.com/git-stunts/git-warp/issues/466) explains common-basis braids; [#485](https://github.com/git-stunts/git-warp/issues/485) adds writer-isolated bisect; [#489](https://github.com/git-stunts/git-warp/issues/489) exposes certificates. Their absence does not remove the five core observation capabilities. If [#394](https://github.com/git-stunts/git-warp/issues/394) reveals a defect in a committed reading, the defect becomes required regardless of the fuzzer's candidate status.

### Discovery

[#220](https://github.com/git-stunts/git-warp/issues/220)/[#231](https://github.com/git-stunts/git-warp/issues/231)/[#254](https://github.com/git-stunts/git-warp/issues/254) need current-source reconciliation before refactoring historical query/traversal seams. [#472](https://github.com/git-stunts/git-warp/issues/472) needs an explicit incremental-backfill contract; [#477](https://github.com/git-stunts/git-warp/issues/477) needs a concrete safe-context consumer boundary. These five are investigations, not five promised production APIs. Record a decision, executable scope, and prerequisites before activation.

### Tracking

No tracking-only card is assigned here. Do not invent a parent implementation PR or make [#854](https://github.com/git-stunts/git-warp/issues/854) wait for the independently owned [#869](https://github.com/git-stunts/git-warp/issues/869) retention publication; its public restart boundary is the distinct missing outcome.

### Explicitly out of scope

New retained storage, graph-wide materialization under an explanation API, canonical merge/unmerge, application event semantics, raw-source custody, cross-runtime occurrence interoperability, and a generic explanation manager exposing RuntimeHost internals.

## Workstreams

These are coordination and ownership groups, not extra issues or inferred dependency edges. Every inventory card belongs to exactly one group; one executable issue still maps to one coherent, independently verifiable PR.

| Key | Workstream and outcome | Associated issues |
| --- | --- | --- |
| occurrences | **Restart-stable causal pairs.** Rehydrate opaque references and expose bounded causal relations with typed refusal. | [#854](https://github.com/git-stunts/git-warp/issues/854) |
| provenance | **Admission history and causal tools.** Own the reading-to-explanation path; investigate or defer broader history tools. | [#421](https://github.com/git-stunts/git-warp/issues/421), [#466](https://github.com/git-stunts/git-warp/issues/466), [#472](https://github.com/git-stunts/git-warp/issues/472), [#473](https://github.com/git-stunts/git-warp/issues/473), [#477](https://github.com/git-stunts/git-warp/issues/477), [#485](https://github.com/git-stunts/git-warp/issues/485), [#489](https://github.com/git-stunts/git-warp/issues/489) |
| strategy | **Query vocabulary, cost, and robustness.** Make actual query behavior explainable; reconcile old refactor claims and optional cursor fuzzing. | [#220](https://github.com/git-stunts/git-warp/issues/220), [#231](https://github.com/git-stunts/git-warp/issues/231), [#254](https://github.com/git-stunts/git-warp/issues/254), [#392](https://github.com/git-stunts/git-warp/issues/392), [#394](https://github.com/git-stunts/git-warp/issues/394), [#395](https://github.com/git-stunts/git-warp/issues/395) |
| receipts | **Receipt and CRDT observability.** Document current receipt semantics and consider bounded conflict counters. | [#126](https://github.com/git-stunts/git-warp/issues/126), [#274](https://github.com/git-stunts/git-warp/issues/274) |

## Dependency structure

Two established chains can be prepared alongside [#854](https://github.com/git-stunts/git-warp/issues/854): [#392](https://github.com/git-stunts/git-warp/issues/392) → [#395](https://github.com/git-stunts/git-warp/issues/395) and [#473](https://github.com/git-stunts/git-warp/issues/473) → [#421](https://github.com/git-stunts/git-warp/issues/421). There is no recorded edge making occurrence rehydration await a new storage format or session-event publication. The three fronts converge at supported public consumers and compatible evidence/basis semantics.

Before treating these fronts as independently mergeable, settle shared basis, completeness, refusal, and cost vocabulary in the relevant issue. If that reveals a real prerequisite, update the tracker and this inventory; do not infer independence from the current sparse graph. [#392](https://github.com/git-stunts/git-warp/issues/392) incorporates existing support-tier distinctions without waiting for the later [#711](https://github.com/git-stunts/git-warp/issues/711) documentation card.

This milestone has **2 incoming direct edges** in the accepted 79-edge graph. 0 originate in an earlier release. Version order is a release policy; absence of a task edge is not proof that contracts are independent.

The following direct prerequisites are generated from the accepted graph. An arrow means the blocker PR must already be integrated for the dependent PR to be correct; preparatory design or witness work may start earlier. "Accepted ownership" and scope reconciliation are planning decisions, not claims that all edges were present in the original reports. Transitive contractual edges are retained.

| Blocker | Dependent | Basis and reason |
| --- | --- | --- |
| [#392](https://github.com/git-stunts/git-warp/issues/392) | [#395](https://github.com/git-stunts/git-warp/issues/395) | scope reconciled: [#392](https://github.com/git-stunts/git-warp/issues/392) owns the operational read-strategy/coordinate vocabulary, including the [#711](https://github.com/git-stunts/git-warp/issues/711) disclosure refinements; the explain-plan result in [#395](https://github.com/git-stunts/git-warp/issues/395) uses that vocabulary with measured cost evidence. [source 1](https://github.com/git-stunts/git-warp/issues/395) |
| [#473](https://github.com/git-stunts/git-warp/issues/473) | [#421](https://github.com/git-stunts/git-warp/issues/421) | previously accepted: Assign public basis-bound provenance reading to [#473](https://github.com/git-stunts/git-warp/issues/473) and make the CLI/MCP explain command consume that supported boundary. This avoids a second provenance engine or a return to cached full-state provenance.  Evidence: [#473](https://github.com/git-stunts/git-warp/issues/473) basis-owned provenance reading; [#421](https://github.com/git-stunts/git-warp/issues/421) CLI/MCP full provenance chain |

## Release evidence

| Claim | Required release witness |
| --- | --- |
| Causality survives restart | Two independently admitted occurrences, full process teardown/reopen, both pair orders, and explicit concurrent versus deterministic-order assertions ([#854](https://github.com/git-stunts/git-warp/issues/854)). |
| Invalid references fail honestly | Missing/malformed/wrong-Lane/unreachable references, bounded evidence, and explicit incomplete/refused outcomes. |
| Provenance stays bounded | Production reading-provider execution with constrained demand, cancellation, missing support, and a control detecting whole-source collection ([#473](https://github.com/git-stunts/git-warp/issues/473)). |
| Explanation agrees with runtime | Public CLI/MCP output compared with the same basis-owned reading; packed TypeScript consumers use opaque references ([#421](https://github.com/git-stunts/git-warp/issues/421)). |
| Strategy disclosure is truthful | Known strategy fixtures with observed costs and basis/support posture, including a stream-drain/full-collection negative case ([#395](https://github.com/git-stunts/git-warp/issues/395)). |

Re-run compatible existing reading/receipt consumers. Fix fixture sizes, pull budgets, and deadlines in each issue before execution; record the exact source and Docker inputs with results.

These are required future release witnesses, not results produced by writing this plan. Link each result to its source commit, reproducible command, fixture/configuration, container image, and resulting integration commit. Use the [release procedure](../../../.github/RELEASE.md) and [release profile](../../../.continuum/release.yml) for the current commands and artifact checks. All tests and benchmarks execute in COPY-based Docker; never mount host repositories or Git directories.

## Risks and open questions

- Deterministic ordering is easy to mislabel as causality; [#854](https://github.com/git-stunts/git-warp/issues/854) must test both independently.
- Incomplete retained support may be mistaken for complete provenance. The public result must expose the limit, not erase it in a CLI rendering.
- [#395](https://github.com/git-stunts/git-warp/issues/395)'s earlier parking note requires a design check of current read seams before implementation; it is now a milestone commitment, not permission to expose private machinery.
- Cursor stability and counters can expand into storage or telemetry redesign. Keep optional work outside the required public observation contract.

## Slip policy

All six candidates and five discovery cards may move after prerequisite review. The three committed capabilities—occurrence relation reading, supported provenance explanation, and honest strategy disclosure—cannot be removed without revising the thesis. Any required breaking API or storage change moves to a major-release plan rather than being hidden in this minor.

Before release preparation, complete or explicitly move every unfinished candidate, discovery, and container to an appropriate later release home in both trackers; update affected prerequisites and regenerate this inventory. The [release guard](../../../scripts/release-guard.sh) requires zero open non-`type:release` issues in the target milestone and zero open issues in prior version milestones. It also checks repository-wide `priority:asap` work. A prose "may slip" category never bypasses those gates. Required work cannot be removed merely to make the count zero.

## Completion criteria

The milestone is complete only when every applicable condition below is true; missing evidence is an unmet condition.

- All five must-ship issues have merged, passing public consumer witnesses at the release source.
- A restarted process can demonstrate the [#854](https://github.com/git-stunts/git-warp/issues/854) relation matrix without parsing private coordinates.
- The [#473](https://github.com/git-stunts/git-warp/issues/473)/[#421](https://github.com/git-stunts/git-warp/issues/421) and [#392](https://github.com/git-stunts/git-warp/issues/392)/[#395](https://github.com/git-stunts/git-warp/issues/395) chains agree on basis, completeness, and observed behavior.
- Existing v20 consumers pass compatibility checks; release documentation claims exactly the supported observation surface.
- Every selected executable issue links one coherent PR and its resulting mainline integration commit, with issue-specific acceptance evidence; tracking parents add no duplicate implementation credit.
- Required label axes, milestone assignments, prerequisite disposition, and the actual release guard pass; unselected work is rehomed before release preparation.
- Required CI, compatibility and Docker witnesses pass on the exact release source. Metadata, changelog, architecture, topics, and operator guidance describe what shipped.
- The normal release process completes review, immutable tagging, registry verification, and the post-release retrospective before the next train activates. This plan does not itself authorize merging or publication.

## Issue inventory

<!-- BEGIN GENERATED ISSUE INVENTORY -->
Generated from the GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific). This is the complete **16-issue planning inventory** for this milestone, not a live completion counter. Titles retain tracker wording, including historical names; each linked issue's current scope/disposition governs implementation.

Every issue has one release home, one commitment category, and one workstream below. A dash in prerequisites means no accepted open-issue prerequisite in this graph; it does not establish independence. Earlier-release prerequisites remain visible.

### Must ship (5)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#392](https://github.com/git-stunts/git-warp/issues/392) — Observer Query Coordinate Language | [FLY-109](https://linear.app/flyingrobots/issue/FLY-109/observer-query-coordinate-language) | strategy | — |
| [#395](https://github.com/git-stunts/git-warp/issues/395) — Query Hologram Explain Plan | [FLY-112](https://linear.app/flyingrobots/issue/FLY-112/query-hologram-explain-plan) | strategy | [#392](https://github.com/git-stunts/git-warp/issues/392) |
| [#421](https://github.com/git-stunts/git-warp/issues/421) — `git warp explain` — trace a value's admission history | [FLY-133](https://linear.app/flyingrobots/issue/FLY-133/git-warp-explain-trace-a-values-admission-history) | provenance | [#473](https://github.com/git-stunts/git-warp/issues/473) |
| [#473](https://github.com/git-stunts/git-warp/issues/473) — Materialization-free provenance readings | [FLY-180](https://linear.app/flyingrobots/issue/FLY-180/materialization-free-provenance-readings) | provenance | — |
| [#854](https://github.com/git-stunts/git-warp/issues/854) — Expose restart-stable occurrence relation readings | [FLY-242](https://linear.app/flyingrobots/issue/FLY-242/expose-restart-stable-occurrence-relation-readings) | occurrences | — |

### Required disposition (0)

None assigned in this snapshot.

### May slip (6)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#126](https://github.com/git-stunts/git-warp/issues/126) — Document readonly receipt arrays | [FLY-18](https://linear.app/flyingrobots/issue/FLY-18/document-readonly-receipt-arrays) | receipts | — |
| [#274](https://github.com/git-stunts/git-warp/issues/274) — No observability for CRDT conflict resolution rates | [FLY-96](https://linear.app/flyingrobots/issue/FLY-96/no-observability-for-crdt-conflict-resolution-rates) | receipts | — |
| [#394](https://github.com/git-stunts/git-warp/issues/394) — Query Cursor Fuzzer | [FLY-111](https://linear.app/flyingrobots/issue/FLY-111/query-cursor-fuzzer) | strategy | — |
| [#466](https://github.com/git-stunts/git-warp/issues/466) — Common-basis braid explainer | [FLY-175](https://linear.app/flyingrobots/issue/FLY-175/common-basis-braid-explainer) | provenance | — |
| [#485](https://github.com/git-stunts/git-warp/issues/485) — Writer-isolated bisect mode | [FLY-189](https://linear.app/flyingrobots/issue/FLY-189/writer-isolated-bisect-mode) | provenance | — |
| [#489](https://github.com/git-stunts/git-warp/issues/489) — `git warp certify` — property certificates as CLI output | [FLY-193](https://linear.app/flyingrobots/issue/FLY-193/git-warp-certify-property-certificates-as-cli-output) | provenance | — |

### Discovery (5)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#220](https://github.com/git-stunts/git-warp/issues/220) — GraphTraversal.js has 11 algorithms in 1617 LOC | [FLY-68](https://linear.app/flyingrobots/issue/FLY-68/graphtraversaljs-has-11-algorithms-in-1617-loc) | strategy | — |
| [#231](https://github.com/git-stunts/git-warp/issues/231) — QueryController.hasNode assigned via external prototype mutation | [FLY-75](https://linear.app/flyingrobots/issue/FLY-75/querycontrollerhasnode-assigned-via-external-prototype-mutation) | strategy | — |
| [#254](https://github.com/git-stunts/git-warp/issues/254) — Split CheckpointTailWitnessLocator before it becomes sludge | [FLY-91](https://linear.app/flyingrobots/issue/FLY-91/split-checkpointtailwitnesslocator-before-it-becomes-sludge) | strategy | — |
| [#472](https://github.com/git-stunts/git-warp/issues/472) — Incremental History Backfill for Git Mirror Use Cases | [FLY-179](https://linear.app/flyingrobots/issue/FLY-179/incremental-history-backfill-for-git-mirror-use-cases) | provenance | — |
| [#477](https://github.com/git-stunts/git-warp/issues/477) — WARP provenance layer for safe-context | [FLY-184](https://linear.app/flyingrobots/issue/FLY-184/warp-provenance-layer-for-safe-context) | provenance | — |

### Tracking (0)

None assigned in this snapshot.

<!-- END GENERATED ISSUE INVENTORY -->
