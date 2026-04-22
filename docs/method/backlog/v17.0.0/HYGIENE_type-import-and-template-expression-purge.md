---
blocks: []
id: HYGIENE_type-import-and-template-expression-purge
blocked_by: []
related:
  - docs/ANTI_SLUDGE_DECISIONS.md
feature: runtime-boundaries
---

# Hygiene: enforce consistent-type-imports and restrict-template-expressions

## Problem

During cycle 0025 adoption (P7), the two bundle-derived ESLint
hygiene rules

- `@typescript-eslint/consistent-type-imports`
- `@typescript-eslint/restrict-template-expressions`

were listed in `docs/ANTI_SLUDGE_DECISIONS.md` as "bring over
immediately." Hot-enabling them surfaced:

- ~26 `import()` type annotations (inline `import('./x').Y`
  syntax) that require manual rewrite — not cleanly autofixable
  because they appear in narrow type positions (e.g.
  `Promise<import('./X').Y>`).
- ~22 template-literal expressions with `string | undefined` or
  `never` operands, which surface real correctness bugs but are
  scattered across the codebase.
- Autofix cascade with `no-duplicate-imports`: the default
  `fixStyle` of `consistent-type-imports` splits one import
  declaration into a `import type` and a value `import`, which
  then trips our existing `no-duplicate-imports` rule. The
  autofix output was locally correct but repository-inconsistent.

Deferring these rules from cycle 0025 keeps P7's anti-sludge
enforcement clean. They are hygiene, not anti-sludge, and deserve
their own focused cycle.

## Fix

Enable both rules as errors with quarantine manifests for the
pre-existing violations. Use these settings:

```js
"@typescript-eslint/consistent-type-imports": ["error", {
  prefer: "type-imports",
  fixStyle: "inline-type-imports",  // avoids no-duplicate-imports cascade
}],
"@typescript-eslint/restrict-template-expressions": ["error", {
  allowAny: false,
  allowBoolean: false,
  allowNever: false,
  allowNullish: false,
  allowNumber: true,
  allowRegExp: false,
}],
```

Then:

1. Run `eslint --fix` to take the autofixable wins (most
   `consistent-type-imports` with `inline-type-imports` fix style).
2. Manually rewrite remaining `import()` inline annotations into
   top-level `import type` declarations.
3. Fix every `restrict-template-expressions` violation at the
   source — these are frequently real bugs (interpolating
   `string | undefined` into a template without a fallback).
4. If any sites cannot be fixed within the cycle, add a new
   `policy/quarantines/HYGIENE-*.json` manifest with rule-scoped
   file-level quarantines, following the same pattern as
   0025A/B/C/D.

## Scope

**In:**
- Both ESLint rules as errors.
- Fixing all pre-existing violations, OR quarantining them with
  a rationale (graduation-on-touch still applies).
- Updating `docs/ANTI_SLUDGE_DECISIONS.md` to move these two rules
  from "deferred" to "active."

**Out:**
- Anti-sludge rules (those land in 0025A/B/C/D).
- Other hygiene rules not in the bundle.

## Exit criteria

- Both rules active as `error`.
- `npm run lint` green.
- Decision memo updated.
- Quarantine manifests (if any) are small and have a written
  paydown owner.

## Priority relative to 0025

Run **after** cycle 0025 closes. Running in parallel would risk
autofix interactions and cluttered commits. The anti-sludge purge
is the higher-priority cleanup; hygiene comes next.
