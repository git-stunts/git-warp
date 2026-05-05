# 0109 Large Graph Bounded Residency Validation

- Status: `hill met`
- Release lane: `v17.0.0`
- Source: `v17_large-graph-bounded-residency-validation`
- Design role: concrete large-graph validation
- Review audience: maintainers and future agents

## Hill

Validate the concrete large graph fixture, identify the exact first
full-residency path, and do not fix anything until that path is known.

Opening constraint:

```txt
Validate first, identify the exact first full-residency path, then fix
only that path.
```

This cycle is validation-first. It does not implement the fix.

## Fixture

Original fixture:

```txt
/Users/james/.think/codex
```

The original fixture was treated as read-only. Mutating probes used this
disposable copy:

```txt
/tmp/git-warp-large-graph.6ZaJP1/repo
```

Fixture facts:

- Repository size: `317M`.
- Git loose object count: `41,432`.
- WARP graph name: `think`.
- WARP refs:
  - `refs/warp/think/checkpoints/head`
  - `refs/warp/think/writers/local.jamess-macbook-pro-2.local.cli`

## Probe Results

### Read-Only Info Probe

Command:

```sh
/usr/bin/time -l node bin/warp-graph.ts info \
  --repo /Users/james/.think/codex \
  --graph think \
  --json
```

Result:

- Passed.
- Discovered graph `think`.
- Writer count: `1`.
- Maximum resident set size: `131579904` bytes.
- Peak memory footprint: `93033408` bytes.

This proves source-runtime graph discovery still works after 0108. It
does not exercise query or materialization residency.

### Read-Only Exact-Miss Query Probe

Command shape:

```sh
/usr/bin/time -l node --input-type=module
```

The script opened `/Users/james/.think/codex` through
`openRuntimeHostProduct()`, ran:

```ts
await graph.query()
  .match('__definitely_missing_large_fixture_probe__')
  .select(['id'])
  .run();
```

Result:

```json
{
  "stateHash": "818b978ddf03cf87e824ad0d406f059b528ab830fea560cd20ce72e8efebc4e2",
  "nodes": 0,
  "elapsedMs": 10126
}
```

Resource evidence:

- Maximum resident set size: `366657536` bytes.
- Peak memory footprint: `373534656` bytes.

The query succeeded, but this was not bounded-residency behavior. A
missing exact-id query still opened a state-backed read model through
full live materialization.

The original fixture refs were checked after this probe and were
unchanged.

### Disposable CLI Materialize Probe

Command:

```sh
/usr/bin/time -l node bin/warp-graph.ts materialize \
  --repo /tmp/git-warp-large-graph.6ZaJP1/repo \
  --graph think \
  --json
```

Result:

```json
{
  "graphs": [
    {
      "error": "Git command failed with code 128",
      "graph": "think"
    }
  ]
}
```

Resource evidence:

- Exit code: `3`.
- Maximum resident set size: `436404224` bytes.
- Peak memory footprint: `383892544` bytes.

This failed after entering the materialize command path. The CLI command
does more than materialize: it also reads graph views and may create a
checkpoint. Therefore this probe is evidence of CLI materialize-path
failure on the disposable copy, not the first bounded-query seam.

### Disposable API Materialize Probe

Command shape:

```sh
/usr/bin/time -l node --input-type=module
```

The script opened the disposable copy through `openRuntimeHostProduct()`
and called:

```ts
await graph.materialize();
```

Result:

```json
{
  "ok": true,
  "elapsedMs": 8980,
  "nodeCount": 3451,
  "edgeCount": 3779,
  "propCount": 33894
}
```

Resource evidence:

- Maximum resident set size: `412991488` bytes.
- Peak memory footprint: `393806656` bytes.

This proves the fixture can physically materialize on this machine, but
it also confirms a full in-memory state result for this path.

## First Full-Residency Path

The first concrete full-residency path is graph-level query:

```txt
graph.query()
  -> QueryController.defaultQueryReadModelProvider()
  -> LiveQueryReadModelProvider.openQueryReadModel()
  -> PatchController._ensureFreshState()
  -> RuntimeHost._materializeGraph()
  -> cached full WarpState
  -> StateQueryReadModel
```

Source evidence:

- `src/domain/services/query/QueryRunner.ts:388` opens the configured
  `QueryReadModelProvider` before query execution.
- `src/domain/services/controllers/QueryController.ts:242` creates the
  default graph query provider from host methods and cached host state.
- `src/domain/services/controllers/QueryController.ts:245` wires
  `ensureFreshState` to `h._ensureFreshState()`.
- `src/domain/services/controllers/QueryController.ts:246` wires the
  read model to `h._cachedState`.
- `src/domain/services/query/LiveQueryReadModelProvider.ts:30` calls
  `#ensureFreshState()` before opening the read model.
- `src/domain/services/query/LiveQueryReadModelProvider.ts:39` returns a
  `StateQueryReadModel` backed by full `WarpState`.
- `src/domain/services/controllers/PatchController.ts:371` checks
  `_autoMaterialize` and cached-state dirtiness.
- `src/domain/services/controllers/PatchController.ts:372` calls
  `_materializeGraph()` when cached state is missing or dirty.
- `src/domain/services/query/StateQueryReadModel.ts:182` iterates
  visible nodes from the full state-backed OR-set.
- `src/domain/services/controllers/MaterializeController.ts:190`
  collects all writer patches for from-scratch materialization.
- `src/domain/services/controllers/MaterializeController.ts:394` hashes
  the full reduced state.
- `src/domain/services/controllers/MaterializeController.ts:395` builds
  full adjacency when the reducer did not return one.

## Decision

The v17 large-graph buffering goal is not met yet.

Current v17 can open the concrete fixture and can execute a small query
against it on this machine. That is not the same as resolving the v16
full-buffering blocker. The exact-miss query still forces graph-level
full materialization before the query read model opens.

The precise first implementation seam is the default graph query read
model provider. The next fix should target that path only:

```txt
QueryController.defaultQueryReadModelProvider()
```

The fix must not become a general RuntimeHost or materialization rewrite.
It should replace the state-backed graph query provider with a bounded
query read model source, or honestly mark the release claim as streaming
groundwork rather than solved buffering.

## Non-Goals

- Do not mutate `/Users/james/.think/codex`.
- Do not refactor materialization during validation.
- Do not clean unrelated `RuntimeHost` seams.
- Do not claim stream safety from `AsyncIterable` shape alone.
- Do not treat successful full materialization as bounded residency.
- Do not treat RSS from this machine as a universal capacity guarantee.

## Next Move

If v17 is still intended to resolve the large-graph buffering blocker,
pull one narrow implementation cycle:

```txt
v17_graph-query-bounded-read-model-provider
```

Scope:

- Replace the default graph query provider path that currently calls
  `_ensureFreshState()`.
- Preserve public `graph.query()` behavior.
- Prove an exact-id miss does not call `_materializeGraph()`.
- Prove bounded query behavior against a fake provider and then against
  the concrete fixture.

Out of scope:

- Full `materialize()` memory model.
- CLI checkpoint creation.
- Strand overlay materialization.
- RuntimeHost decomposition.
- General query-language redesign.

## Validation

Commands run:

```sh
/usr/bin/time -l node bin/warp-graph.ts info \
  --repo /Users/james/.think/codex \
  --graph think \
  --json

/usr/bin/time -l node --input-type=module

git -C /Users/james/.think/codex show-ref
git -C /Users/james/.think/codex count-objects -vH
git -C /Users/james/.think/codex status --short --branch

/usr/bin/time -l node bin/warp-graph.ts materialize \
  --repo /tmp/git-warp-large-graph.6ZaJP1/repo \
  --graph think \
  --json
```

Results:

- Read-only `info` passed.
- Read-only exact-miss `graph.query()` passed but used the
  full-materialization-backed provider path.
- Original fixture refs were unchanged after the read-only query.
- Disposable CLI `materialize` failed with Git exit code `128`.
- Disposable API `graph.materialize()` succeeded and returned full state
  counts.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: full-residency query provider.
  Files: `src/domain/services/controllers/QueryController.ts`,
  `src/domain/services/query/LiveQueryReadModelProvider.ts`,
  `src/domain/services/controllers/PatchController.ts`.
  Why it is sludge: `graph.query()` looks like a bounded read API, but
  its default provider still forces `_ensureFreshState()` and therefore
  `_materializeGraph()` when cached state is missing or dirty.
  Status: tracked as the first implementation seam.
- Pattern: successful probe ambiguity.
  Files: validation process.
  Why it is sludge: a query can succeed on this machine while still
  violating the v17 bounded-residency goal.
  Status: rejected as release proof.
- Pattern: CLI materialize mixed responsibilities.
  Files: `bin/cli/commands/materialize.ts`.
  Why it is sludge: the command path materializes, reads views, creates
  checkpoints, and reports status, so its Git failure is not isolated
  materialization evidence.
  Status: tracked, not fixed.

### 2. Sludge Fixed

- No production sludge was fixed in this validation cycle.
- The concrete first full-residency path was identified:
  `QueryController.defaultQueryReadModelProvider()` to
  `LiveQueryReadModelProvider.openQueryReadModel()` to
  `_ensureFreshState()` to `_materializeGraph()`.

### 3. Sludge Rejected

- Rejected treating `AsyncIterable` query APIs as proof of bounded
  residency.
- Rejected treating a passing exact-miss query as proof that the v16
  buffering blocker is resolved.
- Rejected mutating the original fixture.
- Rejected starting a RuntimeHost or materialization rewrite from a
  validation probe.

### 4. Sludge Deferred / Tracked

- The default graph query provider remains the next precise seam if v17
  keeps the buffering-fix release goal.
- Full `materialize()` still returns an in-memory `WarpState` and
  adjacency.
- CLI `materialize` still has a disposable-copy Git failure after
  entering the command path.
- Release/API notes still need to distinguish streaming groundwork from
  proven bounded-residency behavior unless the query provider seam is
  fixed.

### 5. Anti-Sludge Checks Actually Run

- Read-only fixture ref inspection.
- Read-only fixture object count and size inspection.
- Read-only `info` probe with `/usr/bin/time -l`.
- Read-only exact-miss query probe with `/usr/bin/time -l`.
- Original fixture ref/status check after the query probe.
- Disposable-copy CLI `materialize` probe with `/usr/bin/time -l`.
- Disposable-copy API `graph.materialize()` probe with
  `/usr/bin/time -l`.
- Source inspection of `QueryRunner`, `QueryController`,
  `LiveQueryReadModelProvider`, `PatchController`,
  `StateQueryReadModel`, and `MaterializeController`.

### 6. Remaining Risk

Remaining risk: v17 currently has query streaming shape but not proven
bounded-residency graph-level query behavior. The next implementation
should cut only the identified default query provider path. If that path
cannot be made bounded without deeper storage work, the release claim
must be narrowed instead of papered over.
