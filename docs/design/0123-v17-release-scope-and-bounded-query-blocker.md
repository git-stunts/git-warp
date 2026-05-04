# 0123 V17 Release Scope And Bounded Query Blocker

- Status: `hill met`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Design role: release-scope honesty and gate hygiene

## Hill

Make the current v17 release claim match the current implementation and
turn the red graph-level bounded-query witness into an explicit post-v17
blocked witness instead of a failing v17 gate.

Do not edit production query, runtime, storage, or materialization code
in this cycle.

## Inputs Read

- `docs/design/0122-v17-branch-safety-checkpoint.md`
- `docs/design/0110-graph-query-bounded-read-model-provider.md`
- `docs/design/0107-v17-reality-check.md`
- `docs/design/0105-runtimehost-query-materialization-port-seam.md`

## RED Evidence

The active conformance witness was rerun before any edit:

```text
npx vitest run test/conformance/graphQueryBoundedProvider.test.ts
```

Observed result:

```text
FAIL test/conformance/graphQueryBoundedProvider.test.ts
Error: graph.query exact id-only miss must not full-materialize
```

The current path is:

```text
graph.query()
  -> QueryController.defaultQueryReadModelProvider()
  -> LiveQueryReadModelProvider.openQueryReadModel()
  -> ensureFreshState()
  -> RuntimeHost._materializeGraph()
```

That matches 0110. It is not a fresh 0105 regression.

## Decision

Choose honest v17.

v17 ships:

- TypeScript migration and generated npm type surface.
- Public API honesty.
- Materialization-frontdoor deletion from the public app path.
- Query read-model groundwork from 0105.
- Optics/readings direction.

v17 does not claim:

- live large-graph bounded `graph.query()` residency over stale
  checkpoint plus live tail.
- an honest live `stateHash` source for graph-level bounded query when
  the checkpoint basis is stale.
- a live-tail bounded query/checksum substrate.

0110 already names the blocker: the current `QueryReadModel` requires
`stateHash: string`. For stale checkpoint plus live tail, an honest live
hash requires either applying/hashing the tail against full state or a
real incremental live query/checksum source. Neither source exists
today.

## GREEN Changes

- Moved the failing active conformance witness from
  `test/conformance/graphQueryBoundedProvider.test.ts` to
  `test/conformance/post-v17/graphQueryBoundedProvider.blocked.test.ts`.
- Converted it to a visible `it.todo(...)` witness linked directly to
  `docs/design/0110-graph-query-bounded-read-model-provider.md`.
- Added the 0123 addendum to the 0122 checkpoint so the next-action
  recommendation no longer implies production repair inside v17.
- Updated `CHANGELOG.md` with the narrowed v17 release claim and the
  post-v17 live-tail bounded query/checksum blocker.

## Test Policy

This is not a silent skip and not deletion. The witness remains in the
test tree under `test/conformance/post-v17/` with an explicit design
link. It should become an active conformance test again when the
post-v17 live-tail bounded query/checksum substrate is pulled.

## Validation

Commands run after GREEN:

| Command | Result |
|---------|--------|
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run lint:md` | PASS. |
| `npm run lint:md:code` | PASS; 934 Markdown files checked. |
| `npx vitest run test/conformance/post-v17/graphQueryBoundedProvider.blocked.test.ts` | PASS as explicit blocked witness: 1 skipped file, 1 todo test. |
| `npx vitest run test/unit/domain/services/controllers/QueryController.test.ts` | PASS; 68 tests. |
| `npx vitest run test/unit/domain/WarpGraph.queryBuilder.test.ts` | PASS; 22 tests. |
| `npm run test:local` | FAIL; unchanged release gate shape: 14 failed files, 32 failed tests, 419 passed files, 6741 passed tests. |

The remaining `test:local` failures are the known non-0123 clusters:
checkpoint schema drift, controller materialization seams, stale
materialize-spy tests, observer coordinate pinning, and the uniform
git-cas upgrade source-text assertion.

## Next Gate Work

After this release-scope correction, the next v17 gate work should be:

1. Fix consumer typecheck materialize residue so the public type gate
   proves no public `graph.materialize`.
2. Purge public docs and runtime error text that still instruct users
   to call materialize.
3. Resolve checkpoint schema support drift with a single version matrix.
4. Triage remaining materialize-spy tests one cluster at a time.
