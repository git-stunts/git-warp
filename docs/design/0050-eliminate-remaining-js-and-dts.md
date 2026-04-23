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
- `src/globals.d.ts`
- `src/domain/types/git-cas.d.ts`

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

### 4. Shrink ambient declaration shims where repo truth allows

`src/globals.d.ts` and `src/domain/types/git-cas.d.ts` are boundary honesty
problems:

- ambient globals
- substrate shim declarations
- missing upstream types

This cycle should reduce or relocate those declarations where possible without
faking upstream typing that does not exist yet.

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
