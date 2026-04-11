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

Or push `run()` into a separate `QueryRunner` that takes the
accumulated builder state as input. Builder becomes pure accumulator,
runner is pure executor. Clean separation of concerns.

## Already improved

`QueryGraph` typed interface replaces the old cast-heavy WarpRuntime
access. `requireAdjacencyMaps` and `requireStateHash` provide runtime
boundary validation.
