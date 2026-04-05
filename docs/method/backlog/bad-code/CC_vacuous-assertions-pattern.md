# Codebase has a pattern of vacuous assertions

**Effort:** M

Multiple test files use assertions that are always true:

- `expect(count).toBeGreaterThanOrEqual(0)` on a count (always true)
- `expect(typeof x).toBe('number')` without checking the value
- `expect(result).toBeDefined()` on values that can't be undefined
- `expect(array).toHaveLength(0)` on code that always returns empty

These tests pass regardless of whether the code is correct. They
prove the code runs without crashing, not that it produces correct
output.

Found in: WarpGraph.coverageGaps.test.js, WarpGraph.status.test.js,
WarpGraph.adjacencyCache.test.js, and likely others.

## Suggested fix

Replace with specific value assertions:
```javascript
// BAD: always true
expect(count).toBeGreaterThanOrEqual(0);

// GOOD: tests actual correctness
expect(count).toBe(3);
```

Consider adding an ESLint rule or custom vitest matcher that flags
`toBeGreaterThanOrEqual(0)` and `toBeDefined()` on non-nullable types.
