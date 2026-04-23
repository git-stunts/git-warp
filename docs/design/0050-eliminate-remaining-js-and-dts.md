---
title: "Eliminate the remaining non-TypeScript tail without lying about WarpRuntime blockers"
cycle: "0050-eliminate-remaining-js-and-dts"
---

# Eliminate Remaining `.js` And `.d.ts`

## Why this exists

After `0049` removed the stale "convert remaining JS" premise, the real
non-TS tail in `v17` is much smaller and much sharper:

- root config `.js` files
- ambient and shim `.d.ts` files
- one large WarpRuntime augmentation artifact,
  `src/domain/warp/_wiredMethods.d.ts`

Repo truth after the pull is:

- `eslint.config.js`
- `vitest.config.js`
- `sha1sync.d.ts`
- `src/domain/types/git-cas.d.ts`
- `src/domain/types/trailer-codec-facade.d.ts`
- `src/globals.d.ts`
- `src/domain/warp/_wiredMethods.d.ts`

This cycle exists to burn down the tractable non-TS tail without pretending
that the `_wiredMethods.d.ts` file can disappear before the runtime-wiring
story is actually fixed.

## Hill

A contributor can now answer:

- which remaining non-TS files can be eliminated directly in `v17`
- which remaining declaration artifact is blocked on the WarpRuntime kill path
- how the repo keeps the non-TS tail small without inventing false completion

## Design goals

1. Keep the remaining non-TS cleanup on the active `v17` trunk.
2. Separate directly fixable files from the `_wiredMethods.d.ts` blocker.
3. Eliminate or convert the tractable non-TS files with honest verification.
4. Leave the blocked WarpRuntime augmentation as an explicit runtime-boundary
   problem, not an accidental leftover.

## Non-goals

- No fake promise that `_wiredMethods.d.ts` dies before
  `API_migrate-consumers-to-capabilities` / `API_kill-warpruntime`.
- No broad re-planning of the entire runtime noun family.
- No launch-prep publish or declaration work beyond the files touched here.

## Core diagnosis

The original backlog note bundled together two different categories of work:

### Directly tractable in `v17`

- `eslint.config.js`
- `vitest.config.js`
- `sha1sync.d.ts`
- `src/domain/types/git-cas.d.ts`
- `src/domain/types/trailer-codec-facade.d.ts`
- the `@git-stunts/trailer-codec` portion of `src/globals.d.ts`

### Structurally blocked

- `src/domain/warp/_wiredMethods.d.ts`

That last file is not "just another declaration to convert." It exists because
WarpRuntime still wires methods through `defineProperty`, and the type system
needs an augmentation surface to describe the resulting instance shape.

So the real problem is:

> eliminate the honest non-TS tail now, and isolate the runtime-wiring artifact
> until the owning runtime work actually lands.

## Design

### 1. Treat `_wiredMethods.d.ts` as a blocked compatibility artifact

This file should not be force-converted just to satisfy a file-extension goal.

The truthful options are:

- keep it temporarily and document the blocker
- or split it into a dedicated follow-up note tied to the WarpRuntime kill path

What this cycle must not do is hide the structural dependency.

### 2. Convert config `.js` files only if the toolchain stays honest

`eslint.config.js` and `vitest.config.js` can move to `.ts` only if:

- Node/tooling resolution remains stable
- repo scripts and CI continue to work
- the conversion does not smuggle in cast-heavy config sludge

If one of those tools turns out not to be happy with `.ts` config under current
repo conditions, the cycle should say so explicitly instead of pretending the
rename is free.

### 3. Absorb trivial declaration surfaces into their owning `.ts` files

`sha1sync.d.ts` is not an independent subsystem. Its declaration belongs with
`src/infrastructure/adapters/sha1sync.ts`.

If this file remains separate after the cycle, there needs to be a concrete
reason rooted in publish/tooling truth.

### 4. Merge declaration shards where repo truth allows

`src/globals.d.ts`, `src/domain/types/git-cas.d.ts`, and
`src/domain/types/trailer-codec-facade.d.ts` are boundary honesty problems:

- ambient globals
- substrate shim declarations
- missing upstream types

This cycle should reduce or relocate those declarations where possible without
faking upstream typing that does not exist yet.

The target shape after the cycle is:

- `src/globals.d.ts`
- `src/domain/warp/_wiredMethods.d.ts`

That means:

- delete `sha1sync.d.ts`
- delete `src/domain/types/git-cas.d.ts`
- absorb the trailer-codec facade into `src/globals.d.ts`
- leave `_wiredMethods.d.ts` as the only blocked runtime-wiring artifact

## Playback questions

### Agent

- Can I explain why `_wiredMethods.d.ts` is blocked on runtime surgery rather
  than simple file conversion?
- Can I point to which remaining non-TS files were actually eliminated in this
  cycle?
- Can I explain any config/tooling compatibility caveat if a `.js` config file
  remains?

### Human

- Does the remaining non-TS tail now feel small and truthful?
- Is it obvious which part of the tail is a real runtime blocker rather than
  migration residue?

## Test plan

### Golden path

- targeted non-TS files are converted or removed
- the remaining tracked non-TS tail outside `.obsidian/` is exactly:
  - `src/globals.d.ts`
  - `src/domain/warp/_wiredMethods.d.ts`
- `npm run typecheck` still passes
- targeted tool/config tests still pass after config conversion
- release/package references to touched declaration files stay honest

### Edge cases

- config-file renames preserve script and tool entry resolution
- ambient declarations moved into `.ts` do not accidentally leak runtime code
- deleting `sha1sync.d.ts` does not break the export surface

### Known failure modes

- `_wiredMethods.d.ts` is force-converted without removing the `defineProperty`
  runtime pattern that requires it
- tool configs are renamed to `.ts` but no longer load in local or CI flows
- declaration cleanup silently breaks package/export references

## Playback

### Witness

- `npm exec vitest run test/unit/scripts/non-ts-tail-shape.test.ts`
- `npm run typecheck`
- `npx eslint test/unit/scripts/non-ts-tail-shape.test.ts`
- `git diff --check`
- `rg --files -g '*.js' -g '*.d.ts' . | sort | grep -v '^\\.obsidian/'`

### Agent

- Yes. `_wiredMethods.d.ts` remains because the runtime-wiring / capability
  kill path has not landed; the cycle does not pretend file-extension cleanup
  can solve that.
- Yes. The cycle removed `sha1sync.d.ts`, `src/domain/types/git-cas.d.ts`,
  and `src/domain/types/trailer-codec-facade.d.ts`, and moved the root config
  pair to `eslint.config.ts` / `vitest.config.ts`.
- Yes. The only config caveat is explicit and satisfied: `eslint.config.ts`
  required the loader ESLint itself expects for TS config files, so `jiti`
  was added as a dev dependency instead of silently backing out the rename.

### Human

- Yes. The remaining tracked non-TS tail is now just:
  - `src/globals.d.ts`
  - `src/domain/warp/_wiredMethods.d.ts`
- Yes. It is obvious that `_wiredMethods.d.ts` is the blocked runtime artifact,
  while `src/globals.d.ts` is the remaining ambient boundary shim.

### Verdict

`hill met`

## Drift check

No negative drift against the hill.

Acceptable additive drift:

- `src/domain/types/trailer-codec-facade.d.ts` turned out to be part of the
  real tail even though the original pull doc omitted it.
- Converting `eslint.config.js` truthfully required adding `jiti`, because
  ESLint 9 expects that loader for TS config files in this repo posture.
- A probe against `npm run typecheck:consumer` surfaced broader pre-existing
  public-surface debt around `index.ts`, `WarpCore`, and `_wiredMethods.d.ts`;
  that probe was intentionally left out of the cycle pass criteria rather than
  letting `0050` smuggle in a fake runtime-surface cleanup.
