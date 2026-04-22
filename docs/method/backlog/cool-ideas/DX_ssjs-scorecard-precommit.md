---
id: DX_ssjs-scorecard-precommit
blocked_by: []
blocks: []
feature: testing-quality
---

# Automated SSJS scorecard in pre-commit hook

**Effort:** S

## Idea

We ran the SSJS/SOLID scorecard manually and found 47 code smells in a
single session. Forty-seven. That number should only ever go down, and
the way to guarantee that is to make the machine yell at you before the
commit lands.

The pre-commit hook already runs ESLint. What if it also ran a
lightweight SSJS checker on changed files? Not the full 257-file scan —
just the files you touched. For each one, check the obvious patterns:

- **P1**: `@typedef` used for a domain concept (grep for `@typedef` in
  `src/domain/`). If it's not a helper shape, it's a missing class.
- **P2**: Constructor that doesn't validate its arguments (grep for
  `constructor(` followed by no `throw` or assertion within 10 lines).
- **P5**: `defaultCodec` imported inside domain (grep for the import
  path).
- **P3/P7**: `op.type ===` or `switch (op.type)` tag switching where
  `instanceof` should be used.

These are all grep-able. No AST parsing needed. A simple shell script
in `scripts/hooks/` that runs `git diff --cached --name-only`, filters
to `.js` files in `src/domain/`, and greps each one for the patterns.
Violations print as warnings with file:line references. The developer
sees them before the commit message prompt even appears.

Think of it as a linter for architecture doctrine. ESLint catches syntax
and style; the SSJS checker catches structural dishonesty.

## Why cool

The 47 smells didn't appear overnight. They accumulated one commit at a
time, each one "just this once." A 30-line shell script in pre-commit
would have caught every single one at the moment of creation.
