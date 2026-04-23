---
title: "Close the factory-functions-in-tests card without deleting truthful wire fixtures"
cycle: "0055-factory-functions-in-tests"
---

# Close Factory-Functions In Tests

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`SLUDGE_factory-functions-in-tests` is still represented as live `v17` backlog
work through `WORKLOADS.md`, even though repo truth already says otherwise:

- the note itself is `status: done`
- the `v17` release ledger already marks it closed
- the actual constructor-wrapper sludge was killed in commit `2e99c0cb`
- the remaining wire-format helpers in test fixtures are transport builders,
  not fake domain-constructor wrappers

So the real problem is no longer implementation sludge. The problem is planning
residue.

## Hill

A contributor can now tell, from repo truth alone, that test factory sludge was
already closed, that `WL-35-v17-hygiene-sludge-seed` no longer exists as a live
workload, and that the remaining wire-format helpers are intentionally kept
test transport fixtures.

## Playback questions

### Agent

- Can I point to the commit and note text that already closed the real factory
  sludge?
- Does the live backlog stop presenting `SLUDGE_factory-functions-in-tests` as
  pending work?
- Does the `v17` ledger explain why the remaining wire helpers are not part of
  this sludge card?

### Human

- Is it clear why this cycle did not delete more test helpers?
- Is it clear that the remaining wire-format fixture builders are semantically
  different from constructor-wrapper sludge?

## Accessibility / assistive reading posture

Relevant. A reader should be able to understand the closeout from the release
ledger and workload docs without spelunking old chats or commit archaeology.

## Localization / directionality posture

Not especially relevant. This is repo-truth maintenance, not user-facing
content or layout work.

## Agent inspectability / explainability posture

Relevant. The cycle should leave explicit, inspectable breadcrumbs:

- the existing release-ledger closeout
- the workload removal
- the explanation that wire-format test builders remain on purpose

## Non-goals

- No further rename of wire-format fixture helpers in this cycle
- No mass test-fixture rewrite
- No new transport-fixture abstraction

## Core diagnosis

The original sludge card mixed two different things:

1. real constructor-wrapper helper sludge in tests
2. plain-object wire fixture builders used to exercise decode -> reduce paths

Only the first deserved closure under this card, and that work already landed.
The second is still legitimate test infrastructure.

## Design

### 1. Treat the live card as stale planning residue

Remove the live backlog note and dead workload row. The repo should stop
pretending there is an open implementation cleanup here.

### 2. Keep the existing release-ledger verdict, but sharpen it

The `v17` ledger should say why the card is closed:

- constructor-wrapper sludge already removed in `2e99c0cb`
- remaining wire-format builders are kept intentionally

### 3. Fix downstream narrative residue

Any recent retro or planning doc that still points at `WL-35` or this live card
as the next hygiene trunk should be corrected so we do not create a new ghost
queue.

## Test plan

### RED

Add a doc-shape ratchet that fails until:

- the `v17` release ledger explains why the card is closed
- `WORKLOADS.md` no longer carries `WL-35` or the stale card
- the `0054` retro stops pointing at the dead workload

### GREEN

- update the release ledger closeout text
- remove the stale workload residue
- refresh any recent retro breadcrumb still pointing at the dead queue

### Witness

- `npm exec vitest run test/unit/scripts/factory-functions-in-tests-shape.test.ts`
- `git diff --check`
