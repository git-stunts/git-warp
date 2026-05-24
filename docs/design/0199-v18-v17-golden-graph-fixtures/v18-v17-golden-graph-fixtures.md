---
cycle: 0199
task_id: V18_v17_golden_graph_fixtures
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 46
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 V17 Golden Graph Fixtures

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Capture deterministic v17 graph-history fixtures as Git artifacts with
manifests so v18 migration paths can be tested against real persisted v17
history before any wet-run write path is trusted.

## Playback Questions

- Does the fixture restore a real v17 Git object and ref layout rather than
  only in-memory migration facts?
- Does the fixture manifest name the graph, refs, expected heads, writer
  chains, patch counts, and visible graph facts?
- Can source inventory collection consume the restored fixture without
  touching the developer's live repository?
- Does the fixture cover legacy node, edge, property, content, removal, and
  multi-writer cases needed by the v18 graph-model migration?
- Is Docker treated as an optional hermetic wet-run harness rather than the
  canonical fixture artifact?

## Existing Shape

Slices 42 through 44 proved genesis equivalence vocabulary with compact
fixtures. Those fixtures are useful, but they do not prove that the migration
tool understands the real v17 Git persistence shape. Slice 46 must add that
missing evidence before slice 47 claims real source inventory collection.

## Chosen Boundary

Add a small fixture corpus under a dedicated fixture root. The canonical
artifact should be a Git-native fixture, preferably a `git bundle`, paired
with a deterministic manifest. The manifest is the operator-readable contract;
the Git artifact is the persisted history to restore.

The first fixture should include:

- graph identity and v17 generator metadata;
- writer refs and expected head object ids;
- writer-chain lengths and patch descriptor expectations;
- visible node, edge, property, content, removal, and multi-writer facts;
- optional state snapshot or checkpoint references when present in the v17
  fixture history;
- explicit regeneration and restore instructions.

Docker may wrap restoration and wet-run checks, but Docker is not the source
of truth. Unit and adapter tests should be able to restore the Git artifact
into a temporary directory without requiring a container.

## Non-Goals

- Do not write migrated v18 history in this slice.
- Do not promote or archive live refs.
- Do not store a raw `.git` directory tarball unless `git bundle` is proven
  insufficient.
- Do not make Docker mandatory for normal unit tests.
- Do not claim production migration readiness from fixture restoration alone.

## RED Plan

Add fixture validation tests:

- restored fixture refs match the manifest;
- expected writer-chain heads and patch counts match the restored Git data;
- manifest visible facts include node, edge, property, content, removal, and
  multi-writer cases;
- restoration happens in an explicit temporary target;
- missing or mismatched fixture data fails closed before inventory collection.

## GREEN Plan

Create the smallest deterministic v17 fixture and manifest that exercises the
critical migration surfaces. Prefer a generated fixture script or documented
regeneration command over hand-edited Git data. Keep all parsing and file I/O
in infrastructure or test support; domain migration nouns should only receive
validated facts.

If the fixture must be generated from the v17 package, pin the generator
version and record it in the manifest. If a local v17 checkout is needed for
generation, make that an explicit input rather than an ambient dependency.

## Verification

```text
npx vitest run test/unit/scripts/v18-v17-golden-graph-fixtures.test.ts --reporter=verbose
npm run typecheck
npm run lint:semgrep
npm run lint:sludge
git diff --check HEAD
```

## Closeout Criteria

- A canonical v17 graph-history fixture artifact exists.
- A deterministic manifest describes fixture refs, heads, chains, and visible
  facts.
- Tests restore the fixture into an isolated repository and validate manifest
  expectations.
- The next slice can collect real source inventory from the restored fixture.
- Docker wet-run work is either present as an optional harness or queued with
  clear acceptance criteria.

## Closeout

Slice 46 adds `fixtures/v17/graph-model-golden/v17-golden-graph.bundle` plus
a deterministic manifest. The fixture restores real
`refs/warp/v17-golden-graph/writers/*` refs, validates writer heads and patch
counts in an isolated repository, and records node, edge, property, content,
removal, and multi-writer visible fact coverage. Docker remains optional; the
canonical artifact is the Git bundle and manifest pair.

## SSJS Scorecard

- Runtime-backed forms: green when restored facts become explicit fixture or
  migration nouns before domain code sees them.
- Boundary validation: green when Git, filesystem, and JSON parsing stay in
  adapters or test support.
- Behavior ownership: green when fixtures prove persisted source shape and
  migration code still owns migration behavior.
- Message parsing: green; no behavior branches on command output text.
- Ambient time or entropy: green when fixture generation records deterministic
  identities or injected values.
- Fake shape trust or cast-cosplay: green when tests validate restored Git
  facts instead of trusting loose object bags.
