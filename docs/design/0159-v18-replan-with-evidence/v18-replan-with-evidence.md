---
cycle: 0159
task_id: V18_replan_with_evidence
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 11
---

# V18 Re-Plan With Evidence

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Re-plan v18 slices 11 through 15 from the evidence that actually landed in
PR #94, without widening v18 into the full v19/v21 observer and distributed
runtime program.

## Playback Questions

- Can an agent tell which v18 evidence is now real, and which compatibility
  surfaces remain projections rather than native Continuum witnesshood?
- Can the next five slices be executed as one-commit cycle boundaries without
  losing the generated-artifact authority posture from slices 5 through 10?
- Can a human reviewer see why reading envelopes, suffix shells, and
  runtime-boundary facts are source-fact projections in this campaign, not a
  full observer or sync rewrite?
- Does BEARING now name the active 11 through 15 runway instead of leaving
  slice 11 as a vague re-plan placeholder?

## Accessibility / Assistive Reading Posture

The deliverable is text-first and table-friendly. The next-slice list in
BEARING uses ordered task entries and explicit family names so screen readers
and plain text readers do not need layout or color to recover priority.

## Localization / Directionality Posture

No UI copy or locale-sensitive formatting is introduced. The plan uses stable
repository nouns, file paths, and ASCII punctuation so later translation work
does not have to infer visual directionality.

## Agent Inspectability / Explainability Posture

The slice records:

- current inspected cross-repo heads;
- the merged PR that supplies the evidence base;
- which slices are compatibility projections;
- which later substrate cuts are deliberately deferred.

Future agents should be able to audit the plan from BEARING and this design
without reading chat history.

## Evidence Snapshot

Current inspected sources at re-plan time:

| Source | Head / ref | Evidence |
| --- | --- | --- |
| `git-warp` | `origin/main` at `a4c5467e` | PR #94 merge, BEARING task list, cycles 0146 through 0158 |
| Continuum | `01e0735` | `docs/contract-family-registry.md`, `schemas/continuum-*-family.graphql`, `wesley/profile/scopes.mjs` |
| Wesley | `62328dba` | `out/proof/realization/manifest.json`, Continuum role docs |
| `warp-ttd` | `0491be6` | `src/adapters/gitWarpAdapter.ts`, receipt shell summary tests |
| Echo | `f8d8720` | Continuum alignment and neighborhood/settlement design docs |

## What PR #94 Proved

- Generated Continuum artifact descriptors can be admitted only through an
  explicit load context and generated authority.
- Evidence posture is explicit; generated family shape alone does not imply
  native Continuum witnesshood.
- Receipt-family projection exists for local `TickReceipt`,
  `DeliveryObservation`, and optional `ReceiptShard` source facts.
- `warp-ttd` can consume generated-family git-warp receipt projection facts
  through an explicit smoke without becoming a runtime dependency.
- Patch commit success now means visible writer-tip advancement, and
  same-writer races use CAS conflict posture instead of hidden overwrite.

## Re-Plan

The next five slices should keep the compatibility line narrow:

| Slice | Boundary | Purpose |
| ---: | --- | --- |
| 11 | Re-plan | Close the explicit re-plan placeholder with repo-visible evidence. |
| 12 | Generated-family inventory | Refresh family readiness before projecting more families. |
| 13 | Witness ladder | Split replay core, witness core, and receipt shell for `TickPatch`/`TickReceipt`. |
| 14 | Reading-envelope source facts | Project one read result toward runtime-boundary family shape. |
| 15 | Witnessed-suffix source facts | Project one export suffix toward runtime-boundary suffix shape. |

Slices 14 and 15 are intentionally source-fact projections. They are not the
full v19 observer-plan runtime or a replacement sync protocol.

## Non-Goals

- Do not implement the node-record, edge-record, or attachment-plane substrate
  cuts in this PR.
- Do not claim native Continuum witnesshood for translated git-warp facts.
- Do not pull the full v19 observer-plan runtime into v18.
- Do not pull the full v21 local-site or distributed neighborhood calculus
  into v18.
- Do not make Echo the owner of git-warp's Continuum role.

## RED

Observed before this slice:

```text
docs/BEARING.md still named task 11 only as "Re-plan with evidence in hand"
and did not enumerate the 11 through 15 execution runway.
```

## GREEN

Added this cycle document and updated BEARING to:

- anchor the re-plan to PR #94 and the current cross-repo evidence snapshot;
- mark task 11 complete;
- name tasks 12 through 15 as the active next five slices.

## Verification

```text
npx markdownlint-cli2 docs/BEARING.md docs/design/0159-v18-replan-with-evidence/v18-replan-with-evidence.md
```

## Closeout

Slice 11 closes the planning placeholder and gives slices 12 through 15 a
bounded reviewable runway. The next commit should implement the generated
family inventory refresh as its own cycle boundary.

## SSJS Scorecard

- Runtime-backed forms: green; this slice introduces no runtime code.
- Boundary validation: green; generated authority stays in the next-slice
  inventory plan.
- Behavior ownership: green; Continuum owns family semantics, Wesley compiles,
  git-warp projects source facts, and `warp-ttd` consumes.
- Message parsing: green; no behavior branches introduced.
- Ambient time or entropy: green; no runtime code introduced.
- Fake shape trust or cast-cosplay: green; translated evidence remains the
  named default posture.
