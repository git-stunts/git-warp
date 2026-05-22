---
cycle: 0152
task_id: V18_same_writer_race_witness
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 Same-Writer Race Witness

## Pull

The commit visibility contract is stronger, but v18 receipt projection also
needs proof that concurrent same-writer builders cannot both become visible
truth.

## Hill

A same-writer concurrent patch race has a regression witness proving exactly
one stale builder wins, the final writer frontier names the winning commit, and
only the winning patch is visible after materialization.

## Playback Questions

Agent:

- Do two concurrent builders for the same writer settle with exactly one
  successful commit?
- Does the writer ref point at the winning commit SHA?
- Does materialized graph state include only the winning patch's node?

Human:

- Can receipt-family projection ignore losing same-writer race objects because
  they are not canonical writer-tip history?

## Accessibility / Assistive Reading Posture

No visual surface changes. The witness is an executable regression test.

## Localization / Directionality Posture

No localized strings are introduced.

## Agent Inspectability / Explainability Posture

The test records winning SHA, frontier, and visible state assertions in a way
agents can rerun.

## Non-Goals

- Do not change multi-writer coexistence semantics.
- Do not change conflict analysis or strand behavior.
- Do not project receipt-family values yet.

## RED

Expected failing spec if the CAS/visibility contract regresses:

```text
npx vitest run test/unit/domain/WarpGraph.sameWriterRace.test.ts
```

Observed result after slice 7 CAS hardening:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

This is a regression witness rather than a behavior-changing slice. It would
have been unstable or false before the commit path had CAS-backed final
frontier visibility.

## GREEN

This slice adds `WarpGraph.sameWriterRace.test.ts`. The test creates two
patch builders for the same writer from the same expected parent, commits both
concurrently, and asserts:

- exactly one commit wins;
- exactly one stale builder is rejected with `WRITER_CAS_CONFLICT`;
- the final writer ref names the winning SHA;
- the winning node is visible after materialization;
- the losing node is not visible after materialization.

## Playback

Witness:

```text
npx vitest run test/unit/domain/WarpGraph.sameWriterRace.test.ts test/unit/domain/services/PatchCommitter.visibility.test.ts
Test Files  2 passed (2)
Tests       4 passed (4)

npm run typecheck:test -- --pretty false
npx eslint --no-warn-ignored test/unit/domain/WarpGraph.sameWriterRace.test.ts
```

Agent answers:

- Yes, two concurrent same-writer builders settle with exactly one successful
  commit.
- Yes, the writer ref points at the winning commit SHA.
- Yes, materialized graph state includes the winning node and excludes the
  losing node.

Human answer:

- Receipt-family projection can ignore losing same-writer race objects because
  they are not canonical writer-tip history.

## SSJS Scorecard

- Runtime-backed forms: green; no new runtime model was required.
- Boundary validation: green; the test exercises the runtime through existing
  patch and persistence ports.
- Behavior ownership: green; race semantics remain owned by patch commit and
  writer ref behavior.
- Message parsing: green; assertions use error code and graph state, not error
  text.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; the witness checks final frontier
  and visible state directly.

## Closeout

This closes BEARING task 8 and protects the receipt source stream against
same-writer stale-builder races.
