---
id: API_observer-readable-receipts
blocks: []
blocked_by:
  - API_capability-interfaces
  - GOD_query-controller
  - GOD_materialize-controller
---

# Make receipts observer-readable or replace them with observer-readable truth

## Current shape

- `observer(...)` is the read aperture over graph state
- receipts only come back from `materialize({ receipts: true })`
- consumers that want read-time truth about indexed commits, admission
  outcomes, or tick-local causal context are pushed toward
  materialization-side APIs even when they are not trying to materialize
  state as the product operation

## Why this is debt

- it violates the observer-first doctrine by making some important read
  nouns available only through the materialization pipeline
- it leaks reducer/materialization machinery into consumer query
  planning
- it encourages external tools to mine receipts as metadata oracles
  instead of depending on stable observer-visible read facts

## Desired end state

- either expose receipts through a real observer/worldline read surface
  that can be queried without calling `materialize({ receipts: true })`
- or expose the needed truths as observer-readable graph facts so
  consumers never need raw receipts for ordinary routing decisions
- keep receipts/debug envelopes honest as operational explanation, not
  the only way to inspect certain substrate truths

## Non-goals

- do not promise every reducer-internal detail as a public graph fact
- do not force every debugger payload into the main graph if a parallel
  observer/read-handle surface is cleaner

## Related

- `docs/method/backlog/v19.0.0/PROTO_WESLEY_receipt-envelope-boundary.md`
- `docs/method/backlog/v17.0.0/GOD_materialize-controller.md`
- `docs/method/backlog/v17.0.0/GOD_query-controller.md`
