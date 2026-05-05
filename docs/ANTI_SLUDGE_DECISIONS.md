# Anti-SLUDGE Adoption Decisions

**Status:** Binding
**Scope:** All TypeScript and JavaScript in this repository.
**Companion docs:**
- Full policy: [`docs/ANTI_SLUDGE_POLICY.md`](./ANTI_SLUDGE_POLICY.md)
- Systems-style foundations: [`docs/SYSTEMS_STYLE_TYPESCRIPT.md`](./SYSTEMS_STYLE_TYPESCRIPT.md)
- Executing cycle: `docs/design/0025-anti-sludge-purge/`
- LLM-facing instructions: [`AGENTS.md`](../AGENTS.md)

## 1. Why this document exists

Cycle 0023 taught us the cost of shape-trust TypeScript: we shipped
an abstract class (`ORSetLike`) with a single implementation, named
after a "-Like" shape rather than a real concept. That episode
surfaced a broader observation — the repository already had 353
uses of `Record<string, unknown>`, 69 uses of `as unknown as`, and
14+ files with `*Like` placeholder types — all pre-existing, all
tolerated under an informal "it's legacy" license.

External reference point: the
[anti-SLUDGE policy bundle](https://github.com/flyingrobots/anti-sludge-policy-bundle).
Its rules are stricter than ours in some dimensions (`as unknown
as`, `Record<string, unknown>`, `*Like`, import-boundary law) and
looser in others (missing determinism bans, missing complexity
caps, missing raw-Error discipline).

This document records the binding decisions for how we adopt the
bundle's enforcement and how we repay the pre-existing contamination.

## 2. The five binding decisions

### Decision 1 — Hot adoption, not ratchet

All bundle-level rules land as **hard errors**, effective
immediately, for:

- all net-new code, and
- all files touched by any branch/PR.

Pre-existing violations in **untouched** files are **quarantined**,
not ratcheted. The distinction matters:

- A **ratchet** says "we accept the current count as baseline
  reality." That institutionalizes the sludge. LLMs and humans
  alike find the fence and camp on it.
- A **quarantine** says "this is contaminated ground, and we are
  digging it up." The quarantine list shrinks over time; graduation
  is visible progress; the contract is that we will clear it.

Policy is law. Quarantines are temporary.

### Decision 2 — Quarantine mechanics: Option C (hybrid)

**Default mechanism:** machine-readable manifests at
`policy/quarantines/0025{A,B,C,D}-*.json`, one per purge sub-cycle.
ESLint consumes the manifests to build file-scoped override blocks.

**Quarantine is rule-scoped, not file-cursed.** A file may be
quarantined for `ts-no-record-string-unknown-outside-adapters`
without receiving a free pass on `ts-no-like-types`. There is no
generic "ignore everything about this file" bucket. Each sludge
family has its own manifest, and graduation happens per family.

**Graduation rule:** If a quarantined file is touched in a branch
(via `git merge-base` against the target branch, **never**
`HEAD~1`), the quarantine-graduate-check CI job fails unless:

- the file is removed from the file-level manifest entry, OR
- the file-level entry is replaced with narrow **inline**
  suppressions that reference a ticket number for each specific
  pre-existing line.

This is the pressure gradient. You cannot touch a quarantined file
for a reason unrelated to sludge without acknowledging the sludge.

### Decision 3 — Skip `consistent-type-definitions`

The bundle enforces `@typescript-eslint/consistent-type-definitions:
['error', 'type']`, forcing `type` aliases over `interface`
declarations everywhere.

This conflicts with our architecture-specific rule (from
`SYSTEMS_STYLE_TYPESCRIPT.md`): **`interface` is for ports only;
domain concepts are classes.** That means `interface` IS allowed
and IS meaningful for capability ports, and the bundle's blanket
rule would erase the meaning.

**Architecture-specific law beats generic lint purism.** Skip the
rule; keep our discipline.

### Decision 4 — Defer `verbatimModuleSyntax`

The bundle's tsconfig sets `verbatimModuleSyntax: true`, which is
correct long-term but requires a codebase-wide `import type` sweep
unrelated to sludge.

Mixing import-hygiene migration with anti-sludge enforcement turns
one cleanup into two fires. Land anti-sludge first; file
`verbatimModuleSyntax` as a separate future cycle.

### Decision 5 — Execute paydown in cycle 0025, split four ways

Cycle 0025 is the paydown vehicle. It is **not** one blob. It is
split into four sequential sub-cycles, in deliberate order:

- **0025A — Cast purge.** Eliminate `as unknown as` and `as any`.
  Replace with decoders, narrower helpers, better port types.
- **0025B — Boundary purge.** Remove `Record<string, unknown>` and
  `unknown` from non-adapter code. Move decode/encode to adapters.
  Ban `JSON.parse`/`fetch`/`process.env` in core.
- **0025C — Fake-model purge.** Kill `*Like` types. Replace with
  real domain names or explicit transport DTO names.
- **0025D — Import law.** Enforce no core→infrastructure/framework
  imports. Add adapted hexagonal restrictions.

The order is load-bearing: casts first (they hide everything else),
then boundary leakage (root cause of most casts), then fake naming
(decorative symptoms), then wall tightening (structural fix that
stabilizes the above).

## 3. Rules added from the bundle

| Rule | Enforcement | Source |
|---|---|---|
| `ts-no-like-types` (`*Like` banned in `src/**`) | Semgrep | bundle |
| `ts-no-unknown-outside-adapters` | Semgrep | bundle |
| `ts-no-record-string-unknown-outside-adapters` | Semgrep | bundle |
| `ts-no-double-cast` (`as unknown as`) | Semgrep + ESLint | bundle |
| `ts-no-json-parse-in-core` | Semgrep + ESLint | bundle |
| `ts-no-json-stringify-in-core` | Semgrep + ESLint | bundle (merged with existing ban-nondeterminism) |
| `ts-no-fetch-in-core` | Semgrep + ESLint | bundle |
| `ts-no-process-env-in-core` | Semgrep + ESLint | already ours (strengthen) |
| `ts-no-date-now-in-core` | ESLint | already ours — keep stricter form |
| `@typescript-eslint/consistent-type-imports` | ESLint (active hygiene rule; quarantine-backed paydown) | bundle |
| `@typescript-eslint/no-unnecessary-condition` | ESLint | bundle |
| `@typescript-eslint/restrict-template-expressions` | ESLint (active hygiene rule; quarantine-backed paydown) | bundle |
| `noImplicitOverride` | tsconfig | bundle |
| `isolatedModules` | tsconfig | bundle |
| Core→adapter import ban (adapted to our layout) | ESLint `no-restricted-imports` | bundle, adapted |
| Junk-drawer filename ban (`utils.ts`, `helpers.ts`, `misc.ts`, `common.ts`) | Shell check | bundle |

## 4. Rules kept from git-warp because already stricter

| Rule | Why kept |
|---|---|
| Determinism bans (`Date`/`Math`/`performance`/timers/`crypto.randomUUID`/`setTimeout`/`setInterval` in domain) | Broader than bundle; more specific error messages referencing ports. |
| Raw `Error`/`TypeError` ban | Forces domain error classes extending `WarpError`. Not in bundle. |
| `@ts-ignore` ban (use `@ts-expect-error`) | IRONCLAD M9. Not in bundle. |
| Complexity caps (`complexity`, `max-depth`, `max-lines-per-function`, `max-params`) | Hard structural limits with deliberate per-file carve-outs. Not in bundle. |
| `@typescript-eslint/no-misused-promises` | Catches async bugs the bundle misses. |
| `@typescript-eslint/await-thenable` | Same. |
| `@typescript-eslint/no-floating-promises` | Same. |
| IRONCLAD ratchet (`contracts/any-fence.json`) | Prevents wildcard-type regression. Bundle has no equivalent. |

## 5. Enforcement chain (after rollout is complete)

1. **Author time — ESLint** flags ERRORs immediately in the editor.
2. **Pre-commit hook** runs `npm run lint`, `npm run typecheck:policy`.
3. **Pre-push hook** runs the full test suite and
   `scripts/ban-nondeterminism.ts`.
4. **CI (`ci.yml`) gates:**
   - `lint` (ESLint)
   - `lint:sludge` (shell: junk-drawer filenames + regex sweeps)
   - `lint:semgrep` (Semgrep pattern checks)
   - `lint:quarantine-graduate` (touched-file must graduate or
     narrow its quarantine entry)
   - `typecheck:src` (tsc strict)
   - `typecheck:policy` (IRONCLAD M9 any/wildcard/ts-ignore gate)
5. **Branch protection** requires all gates to pass. No bypass.

## 6. What this document is NOT

- This is not a ratchet contract. `contracts/any-fence.json` still
  exists for IRONCLAD wildcard counts; the quarantine manifests are
  a **separate, paydown-destined** mechanism, not an accounting
  ledger.
- This is not a style preference. Violations are failures.
- This is not advisory. "LLM wrote it that way" is not an excuse.
  "TypeScript allowed it" is not a defense.

## 7. Revision history

| Date | Change |
|---|---|
| 2026-04-16 | Initial adoption. Decisions 1–5 locked. |
| 2026-04-23 | Activated `consistent-type-imports` and `restrict-template-expressions` as quarantine-backed hygiene rules. |
