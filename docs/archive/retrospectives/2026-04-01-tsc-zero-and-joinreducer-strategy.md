# Retrospective: TSC Zero Campaign + JoinReducer OpStrategy

Date: 2026-04-01

Cycle: IRONCLAD / JoinReducer structural coupling

PR: git-stunts/git-warp#73

## Governing Design Inputs

- `.claude/tsc-zero-campaign-prompt.md` — campaign brief (error landscape, lane
  partitioning, gate list)
- `docs/design/joinreducer-op-strategy.md` — strategy registry design
- `adr/ADR-0001-*.md` — canonical op normalization (prior art for op type
  taxonomy)

## What Landed

### TSC Zero Campaign

- **1,707 TypeScript errors → 0** across 271 files
- **1,876 ESLint errors → 0** (from prior lint campaign, included in branch)
- **5 markdown lint issues → 0**
- All 8 pre-push gates green: tsc, IRONCLAD policy, consumer types, ESLint,
  lint ratchet, declaration surface, markdown lint, unit tests
- 5,142 tests green — zero behavioral regressions

Key changes:
- Mechanical TS4111 bracket-access sweep (614 errors, Node script)
- 8-lane parallel agent campaign for 1,093 strictness errors
- ESLint `dot-notation` rule disabled (conflicts with
  `noPropertyAccessFromIndexSignature`)
- `.claude/**` added to ESLint ignores and vitest excludes
- `EffectSinkPort.deliver()` return type widened to
  `DeliveryObservation | DeliveryObservation[]` in `index.d.ts`
- `publicLens` → `publicAperture` in consumer type fixture

### JoinReducer OpStrategy Registry

- Frozen `Map<string, OpStrategy>` with 8 entries (one per canonical op type)
- Each strategy defines 5 methods: `mutate`, `outcome`, `snapshot`,
  `accumulate`, `validate`
- Load-time validation: missing method = hard error at import
- Three apply paths (`applyFast`, `applyWithReceipt`, `applyWithDiff`) rewired
  to use registry — no more triplicated switches
- 15 new tests: 5 registry structure + 10 cross-path equivalence
- Net: +276 / -270 lines (file size neutral)

## Design Alignment Audit

### TSC Zero

- all 8 pre-push gates pass: **aligned**
- no `@ts-ignore`, `@ts-expect-error`, `as any`: **aligned** (two `any` casts
  were caught and removed before merge)
- no behavioral changes: **partially aligned** — three agent-authored files
  (WarpRuntime.js, Observer.js, WormholeService.js) had behavioral regressions
  caught by tests; originals restored with minimal type-only fixes
- ESLint zero preserved: **aligned**
- `dot-notation` rule disabled: **deliberate tradeoff** — `noPropertyAccessFromIndexSignature`
  provides actual type safety; `dot-notation` is purely stylistic; they
  conflict directly

### JoinReducer OpStrategy

- structural coupling guarantee (can't add op without all 5 methods): **aligned**
- `applyFast` zero overhead preserved: **aligned** — still calls only
  `strategy.mutate()` (plus `strategy.validate()`, matching prior behavior)
- public API unchanged: **aligned** — all signatures and return types identical
- cross-path state equivalence tested: **aligned**
- dead code removed (5 switch bodies): **aligned**

## Observed Drift

### 1. Agent over-refactoring (TSC campaign)

Three of eight lane agents made behavioral changes while "fixing types":
- WarpRuntime.js: deleted `buildEffectPipeline`, rearranged imports
- Observer.js: added `_preInitFields()` that broke `_host` access
- WormholeService.js: removed null guard in `deserializeWormhole`

425 test failures resulted. All caught by Gate 8 (unit tests).

**Resolution:** Originals restored; minimal type-only fixes applied. Agent
prompts must be explicit: "NO behavioral changes, NO function deletion, NO
restructuring."

**Status:** accepted — lesson captured in claude-think for future sessions.

### 2. Worktree test/lint leakage

Agent worktrees under `.claude/worktrees/` were picked up by ESLint (6,920
false errors) and vitest (1 duplicate test failure).

**Resolution:** Added `.claude/**` to ESLint ignores and vitest excludes.

**Status:** accepted — permanent fix in config.

### 3. `EffectSinkPort.deliver()` return type widened

`MultiplexSink.deliver()` returns `DeliveryObservation[]` but the port
declared `DeliveryObservation`. Lane 3 agent widened the port; `index.d.ts`
updated to match.

**Resolution:** This is a real API surface change. Downstream consumers that
call `.deliver()` may need to handle the array case.

**Status:** accepted — the widening is correct (multiplex sink fans out to N
sinks, naturally returns N observations).

## Playback

### Hills

1. **"A developer can `git push` without the pre-push firewall blocking on
   type errors."** — Achieved. All 8 gates pass.

2. **"Adding a 9th op type to JoinReducer without defining all behaviors is a
   hard error at module load time."** — Achieved. Load-time validation
   enforces completeness.

### What surprised us

- The TS4111 mechanical fix (614 errors) cascaded: fixing bracket access
  resolved type inference for hundreds of downstream `noUncheckedIndexedAccess`
  errors. 1,707 → 1,093 from a single category.
- `exactOptionalPropertyTypes` was the hardest strictness flag — it requires
  conditional spread (`...(x !== undefined ? {x} : {})`) everywhere optional
  params touch `undefined`. This is the flag most likely to generate ongoing
  friction.
- The JoinReducer was less broken than the audit suggested. The CRDT kernel
  was never bifurcated — only the metadata layers were triplicated. But the
  strategy pattern is still the right fix for coupling.

### What we'd do differently

- **Gate agent behavior more tightly.** The prompt "fix TypeScript errors"
  is too vague — agents interpret it as license to refactor. Future prompts
  must say: "type annotations only, no behavioral changes, no function
  deletion, no helper extraction."
- **Run tests between every merge, not just at the end.** We merged 8
  worktree branches before testing. Should have tested after each merge to
  isolate regressions.
