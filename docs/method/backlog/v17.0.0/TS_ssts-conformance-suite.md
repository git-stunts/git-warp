# SSTS conformance suite

Automated witness for the entire migration. A test suite
(`test/conformance/ssts.test.ts`) that validates structural rules
ESLint can't express:

- One-thing-per-file: exported class `Foo` lives in `Foo.ts`
- No re-export shims
- Object.freeze in value constructors
- `interface` only in `src/ports/` and `src/domain/capabilities/`
- No `unknown` escaping parser functions
- File size ceiling (500/800/300 LOC)

This suite IS the playback witness. Phase 7 of cycle 0013.
