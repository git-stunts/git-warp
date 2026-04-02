# Restore `dot-notation` via `@typescript-eslint/dot-notation`

**Effort:** S

## Problem

ESLint `dot-notation` was disabled globally to resolve conflict with `noPropertyAccessFromIndexSignature`. The proper fix is switching to `@typescript-eslint/dot-notation` which respects the tsconfig flag. This restores lint coverage for actual dot-notation misuse while allowing bracket access on index signatures.

## Notes

- Source: P1b priority tier (TSC Zero Campaign Drift Audit)
- High priority
