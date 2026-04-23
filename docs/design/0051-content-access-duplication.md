---
title: "Close the content-access duplication card without inventing API churn"
cycle: "0051-content-access-duplication"
---

# Close Content-Access Duplication

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`SLUDGE_content-access-duplication` still sits in the active `v17` lane as if
the primary duplication were unresolved.

Repo truth is sharper than that:

- the heavy node/edge duplication already collapsed into
  `src/domain/services/controllers/QueryContent.ts`
- the remaining `NodeContent` / `EdgeContent` object surface is not a sludge
  cleanup inside `QueryController`; it is a public API migration that belongs
  under `API_migrate-consumers-to-capabilities`

So the real job is to remove the stale card cleanly and wire the remaining
surface change to the right trunk.

## Hill

A contributor can now answer, from repo truth alone, that content-access
duplication was already reduced into `QueryContent.ts` and that the remaining
accessor-object surface is deferred explicitly to capability migration.

## Playback questions

### Agent

- Can I point to the current code seam that already removed the worst
  duplication?
- Can I point to the note that now owns the remaining accessor-object API cut?
- Does the `v17` ledger stop presenting `SLUDGE_content-access-duplication` as
  live unresolved work?

### Human

- Is it clear why this card closed without another content-access refactor?
- Is it clear where the remaining `NodeContent` / `EdgeContent` API work moved?

## Accessibility / assistive reading posture

Relevant. The closeout should be legible from the release ledger and the
capability-migration note without requiring a reader to reconstruct old chat or
grep history.

## Localization / directionality posture

Not especially relevant. This is backlog and architecture truth maintenance,
not user-facing copy or layout work.

## Agent inspectability / explainability posture

Relevant. The cycle should leave explicit documentation breadcrumbs:

- the live code seam (`QueryContent.ts`)
- the release-ledger status update
- the capability-migration note owning the remaining API cut

## Non-goals

- No new `NodeContent` / `EdgeContent` public API in this cycle
- No `QueryCapability` signature churn here
- No fake refactor of already-shared content register lookup logic

## Core diagnosis

The original sludge note bundled two different things:

1. implementation duplication inside content lookup and blob access
2. a desired public object surface for content accessors

Only the first was a sludge cleanup. That work already happened in
`QueryContent.ts`.

The second is a consumer-facing capability and public-surface change. It belongs
with `API_migrate-consumers-to-capabilities`, not as a stray layer-0 sludge
card.

## Design

### 1. Treat the current card as a stale residue note

The active live card should leave the `v17` lane.

This cycle does not green a new code path. It closes a stale planning surface by
turning repo truth into the release and backlog ledgers.

### 2. Keep the existing `QueryContent.ts` seam as the evidence

The cycle should point directly at the existing code:

- shared node/edge register extraction
- shared metadata extraction
- shared blob resolution

That is the evidence that the original sludge problem was already materially
reduced.

### 3. Re-home the remaining API cut under capability migration

`API_migrate-consumers-to-capabilities` should explicitly own the remaining
accessor-object surface if we still want:

```ts
query.nodeContent(nodeId).bytes()
query.edgeContent(from, to, label).meta()
```

That avoids carrying one feature request as two supposedly independent tasks.

## Test plan

### RED

Add a small doc-shape ratchet that fails until:

- the `v17` release ledger marks `SLUDGE_content-access-duplication` closed
- the capability-migration note explicitly owns the deferred accessor-object
  surface

### GREEN

- update the `v17` release ledger
- update the capability-migration note
- remove the stale live backlog note and refresh backlog/workload counts

### Witness

- `npm exec vitest run test/unit/scripts/content-access-duplication-shape.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. `src/domain/services/controllers/QueryContent.ts` is the shared seam
  that already collapsed the worst node/edge duplication into one owner.
- Yes. `docs/method/backlog/v17.0.0/API_migrate-consumers-to-capabilities.md`
  now explicitly owns the remaining `NodeContent` / `EdgeContent` accessor
  surface.
- Yes. `docs/releases/v17.0.0/README.md` now marks
  `SLUDGE_content-access-duplication` closed with the correct explanation.

### Human

- Yes. The cycle closed the stale card without pretending another content
  refactor was needed.
- Yes. The remaining accessor-object API work is clearly re-homed under the
  capability migration trunk.

### Verdict

`hill met`

## Drift check

No negative drift.

Positive drift only:

- the cycle hardened the re-home with a small docs ratchet so the stale card
  does not quietly reappear in the release ledger later
