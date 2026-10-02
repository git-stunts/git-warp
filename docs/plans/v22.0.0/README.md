# v22.0.0 — Witnessed merge and local reversibility

Planning status: proposed delivery plan for the accepted [v22.0.0 milestone](https://github.com/git-stunts/git-warp/milestone/24) and matching milestone in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452). Owner: James Ross. No target date is assigned. [All release plans](../README.md).

Snapshot: 2026-10-01 Pacific; source baseline `94b40dac64034cd8caab9bb05efe14a0c22bd735`. Live issue homes/titles and recorded GitHub prerequisites were reconciled with Linear at `2026-10-02T04:24:27.613318+00:00`. Inventory: **20 cards** (9 must ship; 2 may slip; 9 discovery). This describes intended capability, not current implementation or release readiness.

## Release proposition

Introduce authoritative canonical/enriched merge nouns, local-site contracts and witnessed causal-slice collapse with separate admission. Add lowering, agent projections, generated merge contracts and lawful unmerge so consumers can reason about plurality, obstruction and repair without textual conflict folklore.

**Version boundary:** MAJOR: new admission/merge and reversal contracts must explicitly distinguish observer projection from shared canonical truth and reversible Witness from operational receipts.

## Capability boundary

### Before this release

The baseline already has Intent/Lane/Observer APIs, merge/classification machinery, and operational admission or lowering evidence. Those existing nouns do not automatically provide the minimal reversible Witness, authoritative canonical/enriched result algebra, local-site boundary, and lawful forward/reverse braid operations promised here.

### After this release

Consumers can describe a local causal site, perform witnessed causal-slice collapse, distinguish its derived outcome from shared canonical admission, and inspect authoritative conflict/lowering/repair evidence. Supported agent projections and generated helpers use the same runtime contracts. Unmerge can invert or reopen the supported forward operation under an explicit local-reassembly law.

### Still out of reach

Plurality is not eliminated by choosing a winner. Constructing a derived lane does not grant admission. The release does not resolve every theory question, assign Continuum/XYPH product semantics to git-warp, or conflate operational receipts with reversible causal evidence.

## Exit invariants

- [#484](https://github.com/git-stunts/git-warp/issues/484) defines sufficient minimal reversible evidence and the local-reassembly law; existing admission witnesses are not silently retyped.
- [#567](https://github.com/git-stunts/git-warp/issues/567)'s causal-slice optic and [#568](https://github.com/git-stunts/git-warp/issues/568)'s local-site/footprint boundaries preserve that law and explicit overlap/reintegration meaning.
- [#569](https://github.com/git-stunts/git-warp/issues/569) is the authoritative canonical/enriched result, conflict, lowering, and policy noun family; runtime construction validates its invariants.
- [#570](https://github.com/git-stunts/git-warp/issues/570) consumes those nouns and site contracts, preserves lawful plurality, and separates collapse construction from admission.
- [#462](https://github.com/git-stunts/git-warp/issues/462) lowering and [#459](https://github.com/git-stunts/git-warp/issues/459) agent surfaces preserve semantic composition and expose obstruction/repair without inventing a second outcome algebra.
- [#571](https://github.com/git-stunts/git-warp/issues/571) generated helpers agree with runtime contracts and leave application policy outside the compiler.
- [#481](https://github.com/git-stunts/git-warp/issues/481) requires a lawful forward operation plus sufficient stored evidence; unmerge cannot silently reconstruct information that was never preserved.

## Scope

### Must ship

Nine cards define the release: [#484](https://github.com/git-stunts/git-warp/issues/484), [#567](https://github.com/git-stunts/git-warp/issues/567), [#568](https://github.com/git-stunts/git-warp/issues/568), [#569](https://github.com/git-stunts/git-warp/issues/569), [#570](https://github.com/git-stunts/git-warp/issues/570), [#462](https://github.com/git-stunts/git-warp/issues/462), [#459](https://github.com/git-stunts/git-warp/issues/459), [#571](https://github.com/git-stunts/git-warp/issues/571), and [#481](https://github.com/git-stunts/git-warp/issues/481). They cover the reversible evidence foundation, causal-site and merge contracts, forward collapse, lowering/agent/generated consumers, and inverse/reopen behavior.

### May slip

[#402](https://github.com/git-stunts/git-warp/issues/402) provides complete executable advanced multi-writer/collapse examples after [#570](https://github.com/git-stunts/git-warp/issues/570); [#711](https://github.com/git-stunts/git-warp/issues/711) documents support-tier and strand-neighborhood distinctions. These two larger documentation outcomes can move, but minimal public API semantics, failure behavior, and examples required to use each new committed operation must land with that operation.

### Discovery

[#214](https://github.com/git-stunts/git-warp/issues/214) reconciles the current ConflictAnalyzer owners; [#460](https://github.com/git-stunts/git-warp/issues/460)/[#467](https://github.com/git-stunts/git-warp/issues/467)/[#486](https://github.com/git-stunts/git-warp/issues/486) investigate aperture-relative results, conflict metrics, and named merge questions; [#468](https://github.com/git-stunts/git-warp/issues/468)/[#566](https://github.com/git-stunts/git-warp/issues/566)/[#625](https://github.com/git-stunts/git-warp/issues/625) depend on concrete external receipt/playback/protocol readiness; [#475](https://github.com/git-stunts/git-warp/issues/475) reconciles already-implemented plan/admission behavior; [#707](https://github.com/git-stunts/git-warp/issues/707) investigates speculative hints. These nine do not collectively block the runtime contract family. Promote only a specific unresolved law or consumer prerequisite.

### Tracking

No tracking-only cards are assigned. Research cards remain decisions/investigations until they have one observable executable outcome; they are not counted as extra implementation PRs merely because they mention the same merge subsystem.

### Explicitly out of scope

Default winner selection that erases lawful plurality; treating observer projection as shared canonical truth; admission by construction; blanket gating on every research question; application-specific external protocol semantics; duplicating existing witness implementations whose invariants already match.

## Workstreams

These are coordination and ownership groups, not extra issues or inferred dependency edges. Every inventory card belongs to exactly one group; one executable issue still maps to one coherent, independently verifiable PR.

| Key | Workstream and outcome | Associated issues |
| --- | --- | --- |
| causality | **Reversible evidence and local causal sites.** Establish the witness law, collapse optic, and footprint/reintegration boundary. | [#484](https://github.com/git-stunts/git-warp/issues/484), [#567](https://github.com/git-stunts/git-warp/issues/567), [#568](https://github.com/git-stunts/git-warp/issues/568) |
| merge | **Authoritative outcomes and forward/reverse execution.** Deliver runtime nouns and lawful collapse/unmerge; reconcile adjacent research without making it a blanket gate. | [#214](https://github.com/git-stunts/git-warp/issues/214), [#460](https://github.com/git-stunts/git-warp/issues/460), [#467](https://github.com/git-stunts/git-warp/issues/467), [#475](https://github.com/git-stunts/git-warp/issues/475), [#481](https://github.com/git-stunts/git-warp/issues/481), [#486](https://github.com/git-stunts/git-warp/issues/486), [#569](https://github.com/git-stunts/git-warp/issues/569), [#570](https://github.com/git-stunts/git-warp/issues/570), [#707](https://github.com/git-stunts/git-warp/issues/707) |
| consumers | **Lowering, agent projections, and generated contracts.** Use the authoritative runtime family in consumer projections and helpers. | [#459](https://github.com/git-stunts/git-warp/issues/459), [#462](https://github.com/git-stunts/git-warp/issues/462), [#571](https://github.com/git-stunts/git-warp/issues/571) |
| disclosure | **Documentation and external contract alignment.** Provide truthful support disclosure and decide explicit external protocol alignment separately. | [#402](https://github.com/git-stunts/git-warp/issues/402), [#468](https://github.com/git-stunts/git-warp/issues/468), [#566](https://github.com/git-stunts/git-warp/issues/566), [#625](https://github.com/git-stunts/git-warp/issues/625), [#711](https://github.com/git-stunts/git-warp/issues/711) |

## Dependency structure

[#484](https://github.com/git-stunts/git-warp/issues/484) is the common foundation. One chain is [#484](https://github.com/git-stunts/git-warp/issues/484) → [#567](https://github.com/git-stunts/git-warp/issues/567) → [#568](https://github.com/git-stunts/git-warp/issues/568) → [#570](https://github.com/git-stunts/git-warp/issues/570); the other is [#484](https://github.com/git-stunts/git-warp/issues/484) → [#569](https://github.com/git-stunts/git-warp/issues/569) → [#570](https://github.com/git-stunts/git-warp/issues/570). [#567](https://github.com/git-stunts/git-warp/issues/567) also directly gates [#570](https://github.com/git-stunts/git-warp/issues/570)'s optic contract. After [#569](https://github.com/git-stunts/git-warp/issues/569), [#462](https://github.com/git-stunts/git-warp/issues/462) and [#571](https://github.com/git-stunts/git-warp/issues/571) can develop against the agreed noun family; [#459](https://github.com/git-stunts/git-warp/issues/459) converges [#462](https://github.com/git-stunts/git-warp/issues/462)/[#568](https://github.com/git-stunts/git-warp/issues/568)/[#569](https://github.com/git-stunts/git-warp/issues/569).

[#481](https://github.com/git-stunts/git-warp/issues/481) converges [#484](https://github.com/git-stunts/git-warp/issues/484)/[#569](https://github.com/git-stunts/git-warp/issues/569)/[#570](https://github.com/git-stunts/git-warp/issues/570): forward collapse and a sufficient stored witness must exist before claiming reversal. [#402](https://github.com/git-stunts/git-warp/issues/402)'s complete worked examples consume [#570](https://github.com/git-stunts/git-warp/issues/570). The local-site and runtime-noun fronts can proceed after [#484](https://github.com/git-stunts/git-warp/issues/484) subject to explicit shared-contract review. Independent research can inform them, but only an accepted prerequisite changes this graph.

This milestone has **15 incoming direct edges** in the accepted 79-edge graph. 0 originate in an earlier release. Version order is a release policy; absence of a task edge is not proof that contracts are independent.

The following direct prerequisites are generated from the accepted graph. An arrow means the blocker PR must already be integrated for the dependent PR to be correct; preparatory design or witness work may start earlier. "Accepted ownership" and scope reconciliation are planning decisions, not claims that all edges were present in the original reports. Transitive contractual edges are retained.

| Blocker | Dependent | Basis and reason |
| --- | --- | --- |
| [#462](https://github.com/git-stunts/git-warp/issues/462) | [#459](https://github.com/git-stunts/git-warp/issues/459) | scope reconciled: The full agent surface includes executable candidate lowerings and their witnesses. [#462](https://github.com/git-stunts/git-warp/issues/462) owns that lowering boundary; [#459](https://github.com/git-stunts/git-warp/issues/459) exposes it alongside conflict and obstruction facts. [source 1](https://github.com/git-stunts/git-warp/issues/459) |
| [#484](https://github.com/git-stunts/git-warp/issues/484) | [#481](https://github.com/git-stunts/git-warp/issues/481) | previously accepted: An inverse merge must consume a named witness sufficient for local reversibility, not infer reversal from an operational TickReceipt or a display-only lowering summary.  Evidence: [#484](https://github.com/git-stunts/git-warp/issues/484) Witness versus TickReceipt and invert(apply(S),W)=S; [#481](https://github.com/git-stunts/git-warp/issues/481) stored-witness inversion |
| [#484](https://github.com/git-stunts/git-warp/issues/484) | [#567](https://github.com/git-stunts/git-warp/issues/567) | contract-inference: The causal-slice optic must preserve a witness sufficient for local reassembly. Use the minimal reversible Witness owned by [#484](https://github.com/git-stunts/git-warp/issues/484) for its omega component, rather than introducing a second reversible-witness contract. [source 1](https://github.com/git-stunts/git-warp/issues/484) [source 2](https://github.com/git-stunts/git-warp/issues/567) |
| [#484](https://github.com/git-stunts/git-warp/issues/484) | [#569](https://github.com/git-stunts/git-warp/issues/569) | accepted-ownership: Assign the minimal causal/reversible Witness to [#484](https://github.com/git-stunts/git-warp/issues/484). [#569](https://github.com/git-stunts/git-warp/issues/569) owns ConflictWitness and LoweringWitness and must define their relationship to that authoritative causal witness without conflating admission receipts with reversibility. [source 1](https://github.com/git-stunts/git-warp/issues/484) [source 2](https://github.com/git-stunts/git-warp/issues/569) |
| [#567](https://github.com/git-stunts/git-warp/issues/567) | [#568](https://github.com/git-stunts/git-warp/issues/568) | previously accepted: The local-site definition consumes the causal-slice/collapse optic contract and its reintegration boundaries.  Evidence: FLY-203 original blocks; FLY-204 original blocked_by and source |
| [#567](https://github.com/git-stunts/git-warp/issues/567) | [#570](https://github.com/git-stunts/git-warp/issues/570) | documented direct: The collapse implementation consumes the causal-slicing optic directly as well as its local-site realization. Preserve the documented direct contract edge even though a transitive path exists. [source 1](https://github.com/git-stunts/git-warp/issues/570) |
| [#568](https://github.com/git-stunts/git-warp/issues/568) | [#459](https://github.com/git-stunts/git-warp/issues/459) | accepted-ownership: Assign local branch participation, overlap and reintegration boundaries to [#568](https://github.com/git-stunts/git-warp/issues/568). The complete agent merge surface consumes that LocalSite/footprint contract when exposing branch footprints and local repair candidates. [source 1](https://github.com/git-stunts/git-warp/issues/568) [source 2](https://github.com/git-stunts/git-warp/issues/459) |
| [#568](https://github.com/git-stunts/git-warp/issues/568) | [#570](https://github.com/git-stunts/git-warp/issues/570) | previously accepted: Cell-by-cell braid collapse needs an explicit local site for participation, overlap and reintegration.  Evidence: FLY-206 original blocked_by; FLY-204 boundaries |
| [#569](https://github.com/git-stunts/git-warp/issues/569) | [#459](https://github.com/git-stunts/git-warp/issues/459) | scope reconciled: Scope [#459](https://github.com/git-stunts/git-warp/issues/459) to the full agent-facing canonical/enriched merge contract. It consumes [#569](https://github.com/git-stunts/git-warp/issues/569)’s authoritative validated nouns instead of creating independent shadow shapes. Existing inspection facts can be wired earlier. [source 1](https://github.com/git-stunts/git-warp/issues/459) |
| [#569](https://github.com/git-stunts/git-warp/issues/569) | [#462](https://github.com/git-stunts/git-warp/issues/462) | scope reconciled: Scope [#462](https://github.com/git-stunts/git-warp/issues/462) to lowering canonical/enriched results with the authoritative LoweringWitness contract from [#569](https://github.com/git-stunts/git-warp/issues/569). Reuse existing TTD witnesses where compatible; no shadow merge algebra. [source 1](https://github.com/git-stunts/git-warp/issues/462) |
| [#569](https://github.com/git-stunts/git-warp/issues/569) | [#481](https://github.com/git-stunts/git-warp/issues/481) | previously accepted: Unmerge requires the canonical-join/enriched-merge and stored-witness contract it proposes to invert or reopen.  Evidence: FLY-186 proposed outcome; FLY-205 canonical/enriched and witness nouns |
| [#569](https://github.com/git-stunts/git-warp/issues/569) | [#570](https://github.com/git-stunts/git-warp/issues/570) | contract-inference: Collapse must emit canonical/enriched results, policy requirements and witnessed conflict outcomes. Its implementation consumes the runtime invariants owned by [#569](https://github.com/git-stunts/git-warp/issues/569); it must not introduce a competing merge-result family. [source 1](https://github.com/git-stunts/git-warp/issues/569) [source 2](https://github.com/git-stunts/git-warp/issues/570) |
| [#569](https://github.com/git-stunts/git-warp/issues/569) | [#571](https://github.com/git-stunts/git-warp/issues/571) | previously accepted: Generated Wesley merge helpers must target the agreed runtime merge nouns, conflict carriers and lowering contracts.  Evidence: FLY-207 original blocked_by and contract scope |
| [#570](https://github.com/git-stunts/git-warp/issues/570) | [#402](https://github.com/git-stunts/git-warp/issues/402) | previously accepted: The complete advanced workflow guide promises worked braid-collapse examples. Existing-feature documentation can start now; executable collapse examples require the real collapse/admission implementation.  Evidence: [#402](https://github.com/git-stunts/git-warp/issues/402) Proposal: braid composition and collapse with real code; [#570](https://github.com/git-stunts/git-warp/issues/570) missing implementation |
| [#570](https://github.com/git-stunts/git-warp/issues/570) | [#481](https://github.com/git-stunts/git-warp/issues/481) | previously accepted: Unmerge needs a real lawful merge/collapse/admission result to reopen or invert. Noun definitions alone do not implement the forward operation whose causal object is being reversed.  Evidence: [#481](https://github.com/git-stunts/git-warp/issues/481) invert canonical join/reopen enriched merge; [#570](https://github.com/git-stunts/git-warp/issues/570) derived-lane collapse and admitLane |

## Release evidence

| Claim | Required release witness |
| --- | --- |
| Witnesses are sufficient | Local-reassembly laws over deterministic fixtures, missing/incomplete witness refusal, and a control that deliberately discards necessary evidence ([#484](https://github.com/git-stunts/git-warp/issues/484)/[#567](https://github.com/git-stunts/git-warp/issues/567)). |
| Sites preserve semantics | Disjoint/overlapping footprints, local boundaries, reintegration, and basis changes with explicit accepted/refused outcomes ([#568](https://github.com/git-stunts/git-warp/issues/568)). |
| Collapse and admission stay separate | Multi-writer plurality, obstruction, lawful construction with refused admission, and deterministic repeated execution ([#569](https://github.com/git-stunts/git-warp/issues/569)/[#570](https://github.com/git-stunts/git-warp/issues/570)). |
| Consumers agree | Lowering invariants, agent repair/footprint projections, and generated helper fixtures use the same authoritative runtime objects ([#462](https://github.com/git-stunts/git-warp/issues/462)/[#459](https://github.com/git-stunts/git-warp/issues/459)/[#571](https://github.com/git-stunts/git-warp/issues/571)). |
| Reversal is lawful | Forward-then-inverse/reopen witnesses, absent/stale/incompatible evidence refusal, and checkpoint/reopen persistence of required support ([#481](https://github.com/git-stunts/git-warp/issues/481)). |
| Public behavior is real | Installed-package consumers exercise the supported operations; documentation examples do not depend on private nouns or future external schemas. |

Use deterministic writer schedules, independent expected laws, and meaningful negative controls in COPY-based Docker. Counterexamples must be retained as regression fixtures; a schema compiling is not evidence of semantic reversibility.

These are required future release witnesses, not results produced by writing this plan. Link each result to its source commit, reproducible command, fixture/configuration, container image, and resulting integration commit. Use the [release procedure](../../../.github/RELEASE.md) and [release profile](../../../.continuum/release.yml) for the current commands and artifact checks. All tests and benchmarks execute in COPY-based Docker; never mount host repositories or Git directories.

## Risks and open questions

- Witness names currently cover different contracts. Conflating reversible, admission, conflict, and lowering evidence would make reversal unsound.
- The minimal sufficient witness and locality/reassembly law are design obligations, not completed proofs in this plan.
- Local-site/footprint and result-family implementations can drift. Agree shared invariants and reuse existing validated nouns before consumer work.
- Agent repair projections can smuggle in policy or winner selection. Keep observer-relative evidence and shared admission distinct.
- External Continuum/Wesley readiness can affect specific consumers. Record the concrete protocol boundary rather than making all external research a release gate.

## Slip policy

The two broader documentation cards and nine discoveries can move, provided essential API documentation remains with each committed operation. A specific discovery that falsifies witness sufficiency or a merge law becomes required work. Deferring forward collapse, authoritative nouns, lowering/agent/generated consumers, or lawful unmerge changes the proposition and requires a new scope decision.

Before release preparation, complete or explicitly move every unfinished candidate, discovery, and container to an appropriate later release home in both trackers; update affected prerequisites and regenerate this inventory. The [release guard](../../../scripts/release-guard.sh) requires zero open non-`type:release` issues in the target milestone and zero open issues in prior version milestones. It also checks repository-wide `priority:asap` work. A prose "may slip" category never bypasses those gates. Required work cannot be removed merely to make the count zero.

## Completion criteria

The milestone is complete only when every applicable condition below is true; missing evidence is an unmet condition.

- All nine commitments are integrated with shared authoritative runtime contracts and independently green intermediate states.
- Multi-writer, plurality, refused-admission, local-site, lowering, and forward/reverse law witnesses pass on the release source.
- Persisted witness support suffices after reopen; insufficient evidence is explicitly refused.
- Installed consumers and generated helpers agree with runtime semantics; documentation never equates projection, construction, and admission.
- Every selected executable issue links one coherent PR and its resulting mainline integration commit, with issue-specific acceptance evidence; tracking parents add no duplicate implementation credit.
- Required label axes, milestone assignments, prerequisite disposition, and the actual release guard pass; unselected work is rehomed before release preparation.
- Required CI, compatibility and Docker witnesses pass on the exact release source. Metadata, changelog, architecture, topics, and operator guidance describe what shipped.
- The normal release process completes review, immutable tagging, registry verification, and the post-release retrospective before the next train activates. This plan does not itself authorize merging or publication.

## Issue inventory

<!-- BEGIN GENERATED ISSUE INVENTORY -->
Generated from the GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific). This is the complete **20-issue planning inventory** for this milestone, not a live completion counter. Titles retain tracker wording, including historical names; each linked issue's current scope/disposition governs implementation.

Every issue has one release home, one commitment category, and one workstream below. A dash in prerequisites means no accepted open-issue prerequisite in this graph; it does not establish independence. Earlier-release prerequisites remain visible.

### Must ship (9)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#459](https://github.com/git-stunts/git-warp/issues/459) — Agent-first merge surfaces | [FLY-168](https://linear.app/flyingrobots/issue/FLY-168/agent-first-merge-surfaces) | consumers | [#462](https://github.com/git-stunts/git-warp/issues/462), [#568](https://github.com/git-stunts/git-warp/issues/568), [#569](https://github.com/git-stunts/git-warp/issues/569) |
| [#462](https://github.com/git-stunts/git-warp/issues/462) — Canonicalization optics | [FLY-171](https://linear.app/flyingrobots/issue/FLY-171/canonicalization-optics) | consumers | [#569](https://github.com/git-stunts/git-warp/issues/569) |
| [#481](https://github.com/git-stunts/git-warp/issues/481) — Unmerge as first-class | [FLY-186](https://linear.app/flyingrobots/issue/FLY-186/unmerge-as-first-class) | merge | [#484](https://github.com/git-stunts/git-warp/issues/484), [#569](https://github.com/git-stunts/git-warp/issues/569), [#570](https://github.com/git-stunts/git-warp/issues/570) |
| [#484](https://github.com/git-stunts/git-warp/issues/484) — First-class Witness type | [FLY-188](https://linear.app/flyingrobots/issue/FLY-188/first-class-witness-type) | causality | — |
| [#567](https://github.com/git-stunts/git-warp/issues/567) — Strand Collapse Optic For Causal Slicing | [FLY-203](https://linear.app/flyingrobots/issue/FLY-203/strand-collapse-optic-for-causal-slicing) | causality | [#484](https://github.com/git-stunts/git-warp/issues/484) |
| [#568](https://github.com/git-stunts/git-warp/issues/568) — Local site object for neighborhoods | [FLY-204](https://linear.app/flyingrobots/issue/FLY-204/local-site-object-for-neighborhoods) | causality | [#567](https://github.com/git-stunts/git-warp/issues/567) |
| [#569](https://github.com/git-stunts/git-warp/issues/569) — Merge runtime noun family | [FLY-205](https://linear.app/flyingrobots/issue/FLY-205/merge-runtime-noun-family) | merge | [#484](https://github.com/git-stunts/git-warp/issues/484) |
| [#570](https://github.com/git-stunts/git-warp/issues/570) — Implement collapseBraid() per runtime spec | [FLY-206](https://linear.app/flyingrobots/issue/FLY-206/implement-collapsebraid-per-runtime-spec) | merge | [#567](https://github.com/git-stunts/git-warp/issues/567), [#568](https://github.com/git-stunts/git-warp/issues/568), [#569](https://github.com/git-stunts/git-warp/issues/569) |
| [#571](https://github.com/git-stunts/git-warp/issues/571) — Wesley merge contracts | [FLY-207](https://linear.app/flyingrobots/issue/FLY-207/wesley-merge-contracts) | consumers | [#569](https://github.com/git-stunts/git-warp/issues/569) |

### Required disposition (0)

None assigned in this snapshot.

### May slip (2)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#402](https://github.com/git-stunts/git-warp/issues/402) — Advanced multi-writer workflow documentation | [FLY-118](https://linear.app/flyingrobots/issue/FLY-118/advanced-multi-writer-workflow-documentation) | disclosure | [#570](https://github.com/git-stunts/git-warp/issues/570) |
| [#711](https://github.com/git-stunts/git-warp/issues/711) — Supported Outcome Settlement BTR and strand-neighborhood support | [FLY-224](https://linear.app/flyingrobots/issue/FLY-224/supported-outcome-settlement-btr-and-strand-neighborhood-support) | disclosure | — |

### Discovery (9)

| GitHub issue | Linear | Workstream | Accepted prerequisites |
| --- | --- | --- | --- |
| [#214](https://github.com/git-stunts/git-warp/issues/214) — ConflictAnalyzerService is a god object (2582 LOC) | [FLY-64](https://linear.app/flyingrobots/issue/FLY-64/conflictanalyzerservice-is-a-god-object-2582-loc) | merge | — |
| [#460](https://github.com/git-stunts/git-warp/issues/460) — Aperture-relative merge | [FLY-169](https://linear.app/flyingrobots/issue/FLY-169/aperture-relative-merge) | merge | — |
| [#467](https://github.com/git-stunts/git-warp/issues/467) — Conflict distance | [FLY-176](https://linear.app/flyingrobots/issue/FLY-176/conflict-distance) | merge | — |
| [#468](https://github.com/git-stunts/git-warp/issues/468) — Align BTR shells with Continuum receipt families | [FLY-177](https://linear.app/flyingrobots/issue/FLY-177/align-btr-shells-with-continuum-receipt-families) | disclosure | — |
| [#475](https://github.com/git-stunts/git-warp/issues/475) — Plan → Validate → Execute → Observe pipeline | [FLY-182](https://linear.app/flyingrobots/issue/FLY-182/plan-validate-execute-observe-pipeline) | merge | — |
| [#486](https://github.com/git-stunts/git-warp/issues/486) — Merge geometry open questions | [FLY-190](https://linear.app/flyingrobots/issue/FLY-190/merge-geometry-open-questions) | merge | — |
| [#566](https://github.com/git-stunts/git-warp/issues/566) — Align Playback-Head And TTD Consumers After Read Nouns Stabilize | [FLY-202](https://linear.app/flyingrobots/issue/FLY-202/align-playback-head-and-ttd-consumers-after-read-nouns-stabilize) | disclosure | — |
| [#625](https://github.com/git-stunts/git-warp/issues/625) — Decide native vs translated continuum.debug.hello.v1 posture | [FLY-214](https://linear.app/flyingrobots/issue/FLY-214/decide-native-vs-translated-continuumdebughellov1-posture) | disclosure | — |
| [#707](https://github.com/git-stunts/git-warp/issues/707) — cool-ideas: Stigmergic hint pre-warm cache for unmaterialized intents | [FLY-223](https://linear.app/flyingrobots/issue/FLY-223/cool-ideas-stigmergic-hint-pre-warm-cache-for-unmaterialized-intents) | merge | — |

### Tracking (0)

None assigned in this snapshot.

<!-- END GENERATED ISSUE INVENTORY -->
