# Slay QueryBuilder (904 LOC)

## Current shape

Fluent DSL class. Already partially cleaned during Worldline migration
(typed `QueryGraph` interface, boundary validators). Single class with
builder pattern methods and a big `run()` execution method.

## Natural seams

- **DSL construction** (~300 LOC): `match()`, `where()`, `select()`,
  `outgoing()`, `incoming()`, `depth()`, `aggregate()`, `sort()`,
  `limit()`, `offset()`, `distinct()`, `with()`, `count()` — pure
  builder state accumulation, no I/O
- **Execution** (~400 LOC): `run()` — the big method that
  materializes, filters, aggregates, sorts, and returns results
- **Helpers** (~200 LOC): `batchMap`, sorting, field extraction

## Split strategy: 2 files

- `QueryExecution.ts` (~400 LOC) — `run()` + result processing helpers
- `QueryBuilder.ts` (~500 LOC) — DSL + delegates to execution

**Preferred:** Push `run()` into a `QueryRunner` that takes the
accumulated builder state as input. Builder = pure accumulator.
Runner = pure executor. Clean SRP. Both comfortably under 500 LOC.

The "QueryBuilder at 500 LOC" option is ceiling-riding — don't.

## Already improved

`QueryGraph` typed interface replaces the old cast-heavy WarpRuntime
access. `requireAdjacencyMaps` and `requireStateHash` provide runtime
boundary validation.

## SSTS amendments

- **`QueryPlan` value object.** The builder → runner handoff is an
  explicit frozen value object containing match, where, select,
  direction, depth, aggregates, sort, limit, offset. Not a bag of
  fields on the builder instance.
- **Named result type.** `QueryResult` (or `QueryResultSet`) with
  typed fields: nodes, edges, aggregates, stats. Not a plain object.
