---
title: "Migrate observer internals off WarpRuntime"
cycle: "0060-observer-capability-seam"
---

# Migrate Observer Internals Off WarpRuntime

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycle `0059` cleaned the public sync and factory seam, but
`API_migrate-consumers-to-capabilities` is still live because core internal
read surfaces continue to name `WarpRuntime` where they only need a much
smaller contract.

Repo truth says the smallest remaining lie is in `Observer`:

- `Observer.ts` still imports `WarpRuntime`
- `Observer` still instantiates `LogicalTraversal` through
  `this as unknown as WarpRuntime`
- the live/seeking path still hides its backing contract behind
  `as unknown as`
- `Observer` still carries a stale `.js` state-reader import

That is the next honest tranche. It is smaller than detached graph migration,
but large enough to prove the internal consumer migration is still moving.

## Hill

`Observer` and `LogicalTraversal` operate on a narrow observer backing
contract instead of a `WarpRuntime`-typed graph, and the source code leaves no
`WarpRuntime` or `as unknown as` residue in that seam.

## Playback questions

### Agent

- Does `Observer.ts` stop importing `WarpRuntime`?
- Does traversal stop relying on `this as unknown as WarpRuntime`?
- Is the live observer backing expressed as a narrow structural contract?

### Human

- Can I read `Observer.ts` and understand what backing surface it actually
  needs without reverse-engineering `WarpRuntime`?
- Is it obvious that detached graph / `QueryController` migration is still
  separate follow-through work?

## Accessibility / assistive reading posture

Relevant. The smallest internal capability contract should be explicit and
readable where the observer is implemented.

## Localization / directionality posture

Not especially relevant.

## Agent inspectability / explainability posture

Relevant. The slice should leave direct evidence in:

- `src/domain/services/query/Observer.ts`
- `src/domain/services/query/LogicalTraversal.ts`
- `test/unit/domain/services/Observer.test.ts`
- a source-shape ratchet for the observer seam
- the live backlog and release ledger notes

## Non-goals

- No detached graph migration in this slice
- No `QueryController` runtime removal in this slice
- No `WarpApp` / `WarpCore` bridge cleanup in this slice
- No attempt to close the full
  `API_migrate-consumers-to-capabilities` backlog note
- No `API_kill-warpruntime` work yet

## Core diagnosis

The public API no longer needs `_runtime`, but the observer seam still teaches
the same old lesson internally: if you want traversal or seeking, pretend the
observer is a `WarpRuntime`.

That is wrong for two reasons:

1. it hides the real backing contract
2. it makes the next detached/query tranche harder to cut cleanly

So the right move is to state the backing contract explicitly at the observer
boundary and make traversal depend on that contract, not on the full runtime
type.

## Design

### 1. Introduce an explicit observer backing contract

`Observer` should accept a narrow structural backing that covers only the live
operations it actually uses:

- `hasNode`
- `getNodes`
- `getNodeProps`
- `getEdges`
- `observer(...)`
- `_materializeGraph()`

That is enough for:

- live-backed reads
- `seek()`
- `query()`
- traversal

### 2. Let traversal depend on the observer itself, not a fake runtime

`LogicalTraversal` already wants only:

- `hasNode`
- `_materializeGraph()`

So `Observer` should pass itself directly into `LogicalTraversal` instead of
casting itself to `WarpRuntime`.

### 3. Clean the seam source, not just the behavior

This cycle is not done if the runtime still works but the source keeps:

- `import type WarpRuntime`
- `as unknown as`
- stale `.js` imports in the touched observer path

### 4. Keep the parent backlog note alive and sharpen the remaining tail

After this slice, the remaining migration residue should read more precisely:

- detached graph runtime coupling
- `QueryController` runtime coupling
- `WarpApp` / `WarpCore` bridge residue

## Test plan

### RED

Add tests that fail until:

- `Observer.ts` no longer imports `WarpRuntime`
- `Observer.ts` no longer contains `as unknown as`
- `Observer.ts` no longer imports `StateReader.js`
- existing observer behavior still passes through the narrowed seam

### GREEN

- introduce the observer backing contract
- remove the runtime import and self-cast from `Observer`
- fix the stale state-reader import
- update the live backlog/release notes to reflect the new remaining tail

### Witness

- `npm exec vitest run test/unit/domain/services/Observer.test.ts test/unit/scripts/observer-capability-seam.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `Observer.ts` no longer imports `WarpRuntime`.
- Yes. Traversal is now constructed as `new LogicalTraversal(this)`.
- Yes. The live observer seam is now explicit as `ObserverBacking`.

### Human

- Yes. `Observer.ts` now reads like a small explicit contract instead of a
  hidden runtime dependency.
- Yes. Detached graph and `QueryController` work remain clearly separate
  follow-through items.

### Verdict

`hill met`

## Drift check

No negative drift.

Positive drift only:

- the cycle also corrected stale source references in the live backlog note
  (`LogicalTraversal.js`, `QueryBuilder.js`, `warpGraphTestUtils.js`)
- the witness stayed bounded to observer behavior, the seam ratchet, and
  `typecheck`; no detached/query tests were needed because this cycle did not
  move that code
