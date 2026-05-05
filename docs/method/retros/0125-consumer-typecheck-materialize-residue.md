# 0125 Consumer Typecheck Materialize Residue Retrospective

- Outcome: `hill met`
- Cycle doc: [docs/design/0125-consumer-typecheck-materialize-residue.md](../../design/0125-consumer-typecheck-materialize-residue.md)
- Release lane: `v17.0.0`
- DAG task: `SPEC_consumer-typecheck-materialize-residue`

## Outcome

The consumer typecheck gate is green again for the v17 app surface.

The stale `graphBag.materialize.materialize()` positive expectation was
removed from the compile-only consumer fixture. The fixture now proves
that `openWarpGraph()` exposes reads through `graph.query`, and it uses
negative `@ts-expect-error` checks to keep `materialize` off the
`WarpGraph` capability bag.

## What Went Well

- The existing RED was precise: `WarpGraph` correctly had no
  `materialize`, but the consumer fixture still expected it.
- The fix stayed test-only for TypeScript code. No production shim was
  needed.
- The new positive coverage names the actual v17 read surface instead
  of merely deleting a stale assertion.
- The release blocker DAG now has an explicit status table, so execution
  can proceed one open node at a time.

## What Went Wrong

- The variable naming in the consumer fixture still makes the split
  easy to misread: `graph` is `WarpCore`, while `graphBag` is
  `WarpGraph`. The type annotations are clear, but the names carry
  old mental furniture.
- The docs still teach materialization, so this fix improves the type
  gate before the human onboarding path catches up.
- The broader test suite still has materialize-spy clusters that cannot
  be honestly rewritten until the docs/errors/controller seams settle.

## What This Cycle Proved

- `npm run typecheck:consumer` now passes.
- The v17 `openWarpGraph()` public app surface has no materialize
  capability bag.
- The public read surface is type-covered through query, state snapshot,
  worldline, observer, and node-prop reads.
- A future accidental reintroduction of `graphBag.materialize` should
  break the consumer typecheck gate.

## What This Cycle Did Not Prove

- It did not prove public docs are honest.
- It did not prove runtime error guidance is honest.
- It did not remove `_materializeGraph()` from internal read paths.
- It did not make `npm run test:local` green.
- It did not address quarantine graduation.

## Recommendation For Next Cycle

Pull `SPEC_docs-materialize-frontdoor-drift`.

Reason: it is an open DAG node, it directly supports the runtime error
guidance task, and it closes the human-facing half of the same public
contract that this cycle fixed in TypeScript.

Battle report: we pulled one rusty signpost out of the consumer gate,
proved the shiny road is `graph.query`, and left the larger machinery
where it belongs: marked, fenced, and waiting its turn.
