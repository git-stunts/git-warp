# Visualization Test Suite

## Overview

This directory contains tests for the ASCII visualization renderers that power `git warp info`, `git warp check`, `git warp materialize`, `git warp history`, and `git warp path`.

There are two categories of tests:

- **Snapshot tests** (`ascii-renderers.test.js`) — capture the full rendered output of each renderer and fail when the output changes, ensuring visual regressions are caught in review.
- **Unit tests** (`visualization-utils.test.js`) — standard assertion-based tests for the pure utility functions (truncate, padding, time formatting, progress bars, etc.).

## Running Tests

```bash
# Run all visualization tests
npx vitest run test/unit/visualization/

# Run only snapshot tests
npx vitest run test/unit/visualization/ascii-renderers.test.js

# Run only utility tests
npx vitest run test/unit/visualization/visualization-utils.test.js
```

## Updating Snapshots

When you intentionally change renderer output, the snapshot tests will fail. To accept the new output:

```bash
npx vitest run test/unit/visualization/ --update
```

This rewrites the snapshot file at `test/unit/visualization/__snapshots__/ascii-renderers.test.js.snap`. **Always review the diff** in your PR to confirm the changes are intentional.

## Reviewing Snapshot Diffs in PRs

The `.snap` file is committed to version control. When a PR modifies it:

1. Open the diff for `__snapshots__/ascii-renderers.test.js.snap`.
2. Verify that every changed snapshot reflects an intentional change to the renderer.
3. Watch for unintended whitespace shifts, missing sections, or broken box-drawing characters.

## Guidelines for Adding New Snapshot Tests

1. **Mock `Date.now()`** — Time-dependent output (e.g., "5m ago") must be deterministic. The test file uses `vi.spyOn(Date, 'now').mockImplementation(() => FIXED_NOW)` in `beforeAll`.

2. **Strip ANSI** — Always wrap renderer output in `stripAnsi()` before calling `toMatchSnapshot()`. Chalk color codes vary by terminal and CI environment; stripping them ensures stable snapshots.

3. **Use realistic mock data** — Provide data structures that mirror what the CLI commands actually produce. Check the renderer's JSDoc or the corresponding command handler for the expected shape.

4. **Cover edge cases** — Each renderer should have snapshots for: normal output, empty/missing data, error states, and boundary conditions (many items, long strings, null fields).

5. **One assertion per logical state** — Prefer separate `it()` blocks over multiple `toMatchSnapshot()` calls in one test, so failures pinpoint exactly which state broke.
