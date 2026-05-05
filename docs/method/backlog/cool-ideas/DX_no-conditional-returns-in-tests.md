---
id: DX_no-conditional-returns-in-tests
blocked_by: []
blocks: []
feature: testing-quality
---

# Ban conditional early returns in test bodies

## Idea

The test quality audit found multiple tests using
`if (!result) { return; }` which makes them vacuous — they pass when
the code is broken because they exit before assertions. A simple lint
rule: flag `return` statements inside `it()` callbacks that aren't
inside helper functions. The rule: "every `it()` block must reach at
least one `expect()` on every code path."

This is the single most impactful test quality rule from the audit.
Could be implemented as a custom ESLint rule or a vitest plugin that
counts `expect()` calls and warns when a test exits with zero
assertions.
