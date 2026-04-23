---
title: "Convert remaining JavaScript in bounded TypeScript batches"
cycle: "0049-convert-remaining-js"
---

# Convert Remaining JavaScript

## Why this exists

The pulled backlog note claimed `v17` still had a live JavaScript tail across
`src/`, `bin/`, and `scripts/`.

This cycle existed to turn that census into a truthful execution slice.

Repo truth proved the premise false: the active tree already has no live `.js`
files under those paths.

## Hill

A contributor can now answer:

- what the remaining JavaScript tail actually consists of
- what batch order keeps the migration honest
- which file families can be converted directly and which require structural
  splits first
- how this cycle will stay bounded instead of pretending the whole JS tail is a
  one-commit job

## Design goals

1. Validate the pulled JS-census premise against repo truth before doing fake
   migration work.
2. Refuse any "convert everything" approach that would hide already-completed
   conversion work behind stale backlog notes.
3. Leave the backlog more truthful than it was before the pull.

## Non-goals

- No fake RED/GREEN cycle against files that are already `.ts`.
- No attempt to preserve stale backlog notes just because they once described
  real work.
- No launch-prep declaration or publish work in this cycle.

## Core diagnosis

The backlog note was stale.

Direct repo inspection showed:

- `find src bin scripts -type f -name '*.js'` returns nothing
- the only tracked `.js` files left in the active tree are config/plugin files
  such as `eslint.config.js` and `vitest.config.js`
- the sibling notes `TS_infrastructure-adapters` and `TS_cli-viz-scripts`
  describe already-converted paths, not live work

So the real problem is not "convert all the JS." The real problem is:

> remove stale TS-migration planning notes and move the actual remaining non-TS
> tail into the active release plan.

## Design

### 1. Treat the pulled note as a premise check

The only honest first move was to compare the note against the active tree.

Once the premise failed, the cycle stopped being an implementation slice and
became a backlog-correction slice.

### 2. Remove sibling notes that describe already-finished conversion work

`TS_infrastructure-adapters` and `TS_cli-viz-scripts` were describing paths
that are already `.ts` or `.sh` in the active tree.

Those notes should not remain live backlog items after this cycle.

### 3. Promote the actual remaining non-TS tail

The remaining honest TS-adjacent cleanup is
`TS_eliminate-remaining-js-and-dts`:

- config files
- ambient declaration files
- the `_wiredMethods.d.ts` compatibility artifact

That is the next real slice after this cycle.

## Playback questions

### Agent

- Can I explain why `TS_convert-remaining-js` was a stale premise rather than a
  real execution slice?
- Can I point to the evidence that `src/`, `bin/`, and `scripts/` no longer
  contain live `.js` files?
- Can I identify the next honest non-TS cleanup slice after deleting the stale
  notes?

### Human

- Is it clear why this cycle closed early instead of inventing fake migration
  work?
- Is it clear which remaining note is the real non-TS tail after the stale
  cards are removed?

## Test plan

### Golden path

- repo inspection proves there are no live `.js` files in `src/`, `bin/`, or
  `scripts/`
- stale conversion backlog notes are removed
- the release/workload ledgers now point at the real remaining non-TS tail

### Edge cases

- root config `.js` files stay out of scope for this cycle
- `.d.ts` cleanup work is preserved as a separate honest follow-up

### Known failure modes

- stale conversion notes stay live and keep lying about `v17`
- the cycle pretends to green conversion work that is already present

## Playback

### Witness

The premise check is backed by:

- `find src bin scripts -type f -name '*.js'`
- `find . -path './.git' -prune -o -path './node_modules' -prune -o -path './.claude' -prune -o -type f -name '*.js' -print`
- [README.md](/Users/james/git/git-stunts/git-warp/docs/releases/v17.0.0/README.md)
- [WORKLOADS.md](/Users/james/git/git-stunts/git-warp/docs/method/backlog/WORKLOADS.md)

### Agent

1. *Can I explain why `TS_convert-remaining-js` was a stale premise rather than
   a real execution slice?*
   Yes. The active tree already has no live `.js` files under `src/`, `bin/`,
   or `scripts/`, so the pulled backlog note no longer described repo truth.

2. *Can I point to the evidence that `src/`, `bin/`, and `scripts/` no longer
   contain live `.js` files?*
   Yes. Direct `find` output shows zero matching files under those paths.

3. *Can I identify the next honest non-TS cleanup slice after deleting the
   stale notes?*
   Yes. The remaining live note is `TS_eliminate-remaining-js-and-dts`.

### Human

1. *Is it clear why this cycle closed early instead of inventing fake migration
   work?*
   Yes. The repo already satisfies the premise the cycle would have been trying
   to prove.

2. *Is it clear which remaining note is the real non-TS tail after the stale
   cards are removed?*
   Yes. The real tail is no longer JS conversion; it is config and `.d.ts`
   elimination.

Verdict: not met. Premise invalid.

## Drift check

Positive drift only:

- the cycle removed two additional stale sibling backlog notes,
  `TS_infrastructure-adapters` and `TS_cli-viz-scripts`, because the same
  premise check proved their scope already satisfied as well
- the workload partition now carries `TS_eliminate-remaining-js-and-dts` on the
  active `v17` trunk instead of leaving it mis-slotted in a later wave
