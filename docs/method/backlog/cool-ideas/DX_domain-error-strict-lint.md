# ESLint rule: `throw new Error(...)` is banned; require domain error subclass

**Effort:** XS-S

## Idea

SSTS says: "No raw `Error`. Domain failures are first-class objects.
Use specific error classes. Never branch on `err.message`."

ESLint has `@typescript-eslint/only-throw-error` which forbids throwing
non-Error values. But it doesn't distinguish between `throw new Error(...)`
and `throw new WarpError(...)`. We want the stricter rule: only throw
subclasses of a project-defined `DomainError` base (or one of the
specific WarpError / PatchError / QueryError / SyncError classes).

```js
// eslint.config.js
{
  rules: {
    'no-restricted-syntax': ['error', {
      selector: "ThrowStatement > NewExpression[callee.name='Error']",
      message: "Don't throw raw Error. Use a domain error class (WarpError, PatchError, QueryError, SyncError) with a structured `code` field.",
    }, {
      selector: "ThrowStatement > NewExpression[callee.name='TypeError']",
      message: "Don't throw raw TypeError. Use a domain error class with a `code` field.",
    }],
  },
}
```

A slightly more sophisticated version uses a custom rule that checks
the `throw`-expression is a known domain error subclass via a type
check.

## Why cool (agent-first angle)

- **The user called this out this session** after the agent introduced
  raw Error throws in test narrowing helpers. An ESLint rule would
  have blocked it at write-time instead of requiring a review round-trip.
- **Agents are fast and can be sloppy.** Machine enforcement beats
  agent memory.
- **Closes a ratchet** — no new raw Errors can sneak in even during
  rapid refactors.

## Why it hasn't been done

The no-restricted-syntax rule has to list every domain error class
to allow them. That's maintenance burden. The cleaner approach is a
custom ESLint rule that inspects the thrown expression's type and
allows anything that extends `DomainError` (or a configured base
class).

## Implementation

- Option A: `no-restricted-syntax` with selectors that ban
  `Error` and `TypeError` constructor calls in throw statements.
  Simple, no plugin.
- Option B: custom ESLint plugin `eslint-plugin-git-warp` with a
  `domain-errors-only` rule. More work, more flexible.
- Option C: just a `no-restricted-globals` rule that bans `Error` and
  `TypeError` entirely in source directories, with specific overrides
  for the files that define domain errors themselves.

Option A is the 80/20 win.

## Related

- `DX_ssts-conformance-suite.md` — could check this as part of the
  conformance test run instead of (or in addition to) at lint time
- `DX_ssjs-scorecard-precommit.md` — could check this in pre-commit
