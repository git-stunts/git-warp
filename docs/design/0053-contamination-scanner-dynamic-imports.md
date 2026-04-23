---
title: "Make import-law enforcement see dynamic imports and refactor the hidden violations"
cycle: "0053-contamination-scanner-dynamic-imports"
---

# Contamination Scanner Dynamic Imports

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycle `0025D` fixed static import-law violations, but it left a blindspot:

- `await import('node:crypto')`
- `typeof import('node:crypto').createHash`
- `await import('../../../infrastructure/adapters/X.ts')`

The current scanner misses those forms.

That means the repo can claim import-law cleanliness while still allowing hidden
dynamic platform and adapter imports in core code.

## Hill

Import-law enforcement now detects dynamic `node:*` and dynamic
`infrastructure` imports in core code, while the remaining sanctioned dynamic
adapter loaders are documented narrowly and the hidden `defaultTrustCrypto` /
`roaring` violations are removed.

## Playback questions

### Agent

- Does the scanner now name dynamic import-law violations instead of missing
  them?
- Are `defaultTrustCrypto.ts` and `roaring.ts` free of direct `node:*` dynamic
  imports?
- Is the sanctioned dynamic adapter-loader carve-out explicit and narrow?

### Human

- Is it clear which dynamic imports are still allowed and why?
- Is it clear that the hidden violations were fixed rather than merely ignored?

## Accessibility / assistive reading posture

Relevant. The policy and design should make the allowlist legible without
requiring a reader to infer it from scanner code alone.

## Localization / directionality posture

Not especially relevant. This is policy and runtime-boundary work.

## Agent inspectability / explainability posture

Relevant. The cycle should leave:

- scanner evidence
- semgrep mirror evidence
- policy text naming the sanctioned files
- direct code evidence in `defaultTrustCrypto.ts` and `roaring.ts`

## Non-goals

- No broad portification of bitmap loading in this cycle
- No rewrite of sync HTTP client resolution beyond documenting the sanctioned
  loader posture
- No attempt to remove all dynamic imports from core code; the goal is narrow,
  explicit, and auditable dynamic adapter loaders

## Core diagnosis

There are two distinct cases hiding under the same blindspot:

1. **Real violations**
   - `defaultTrustCrypto.ts` importing `node:crypto`
   - `roaring.ts` importing `node:module`

2. **Sanctioned dynamic adapter loaders**
   - `defaultCrypto.ts`
   - `SyncController.ts`
   - the refactored `defaultTrustCrypto.ts`
   - the refactored `roaring.ts`

The scanner currently sees neither.

The repo needs to distinguish them explicitly instead of relying on a blindspot.

## Design

### 1. Tighten the contamination scanner

Add dynamic detection for:

- `import('node:...')`
- `typeof import('node:...')`
- dynamic imports of `src/infrastructure/**`

### 2. Mirror the dynamic-import rules in Semgrep

Semgrep should match the same family so the policy does not depend on one
scanner only.

### 3. Document the sanctioned loader carve-out

The policy should name the exact files allowed to lazy-load adapters from core:

- `src/domain/utils/defaultCrypto.ts`
- `src/domain/utils/defaultTrustCrypto.ts`
- `src/domain/utils/roaring.ts`
- `src/domain/services/controllers/SyncController.ts`

No other core file gets this escape hatch by implication.

### 4. Refactor the hidden violations behind adapters

- `defaultTrustCrypto.ts` should lazy-load `TrustCryptoAdapter.ts`
- `roaring.ts` should lazy-load an adapter module that owns the package and
  `node:module` fallback logic

That preserves the runtime behavior while removing direct `node:*` reach from
core.

## Test plan

### RED

Add a ratchet that fails until:

- scanner and Semgrep mention dynamic import-law patterns
- policy lists the sanctioned loader files
- `defaultTrustCrypto.ts` no longer mentions `node:crypto`
- `roaring.ts` no longer mentions `node:module`

### GREEN

- patch the scanner and Semgrep
- document the allowlist
- refactor `defaultTrustCrypto.ts`
- extract the roaring loader into infrastructure and keep the domain wrapper
  honest

### Witness

- `npm exec vitest run test/unit/scripts/contamination-dynamic-imports-shape.test.ts test/unit/domain/utils/defaultTrustCrypto.test.ts test/unit/domain/utils/defaultTrustCrypto.unavailable.test.ts test/unit/domain/utils/roaring.test.ts`
- `npm run lint:contamination`
- `git diff --check`

