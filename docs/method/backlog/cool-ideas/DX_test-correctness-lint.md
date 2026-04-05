# ESLint rule for vacuous test assertions

The removeNode bug survived 5500+ tests because 6 tests asserted
the bug was correct. The audit found more: conditional early returns,
always-true assertions, if/else accepting both outcomes.

What if ESLint caught these patterns?

Detectable anti-patterns:
- `if (!result) { return; }` inside a test body (conditional bail)
- `expect(x).toBeGreaterThanOrEqual(0)` (always true for counts)
- `expect(x).toBeDefined()` on non-nullable types
- `expect(fn).not.toThrow()` without a corresponding positive test
- `try { fn(); } catch (e) { expect(e)... }` without `expect.assertions()`

A custom ESLint plugin — `eslint-plugin-honest-tests` — that
flags these in test files only. Not a blanket ban (`.toBeDefined()`
is valid in some contexts), but a warning that says: "This assertion
might be vacuous. Is the test actually proving correctness?"

Could also flag the `if/else both-outcomes` pattern:
```javascript
// FLAGGED: test accepts contradictory outcomes
if (condition) {
  expect(a).toBe(1);
} else {
  expect(b).toBe(2); // this path means the first didn't happen
}
```

The rule: a test body should have exactly one expected outcome.
Branches in test assertions are a smell.
