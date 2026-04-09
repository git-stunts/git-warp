# SSTS Conformance Suite

Automated enforcement of Systems-Style TypeScript rules that ESLint
can't express.

## Already lintable (ESLint)

- no-explicit-any
- no-unsafe-* family
- no-restricted-syntax for raw Error
- max-lines (file size ceiling)
- no-restricted-globals for Buffer in domain

## Needs custom enforcement

### One-thing-per-file
For each `.ts` file that exports a class `Foo`, assert the filename
is `Foo.ts`. Flag re-export shims (files whose only statement is
`export { X } from './Y.ts'`).

### No re-export shims
If a file is named `Foo.ts`, the class `Foo` must be defined in that
file — not re-exported from elsewhere.

### Object.freeze in value constructors
Every class in `src/domain/types/` and `src/domain/errors/` should
call `Object.freeze(this)` in its constructor (unless it's explicitly
mutable, like Patch which builds ops incrementally).

### Interface only in ports
`interface` declarations should only appear in `src/ports/` or as
local implementation types (not exported from domain).

### No unknown escaping parsers
Functions with `unknown` return types or `unknown` fields on exported
types — flag for review.

## Implementation

A `test/conformance/ssts.test.ts` file that:
1. Globs all `.ts` source files
2. Parses exports via tree-sitter or regex
3. Validates structural rules
4. Runs in CI alongside unit tests

Alternatively: a `scripts/ssts-lint.ts` that runs as a CI gate.
