---
id: SPEC_audit-tests-vacuous-early-return
blocked_by: []
blocks: []
feature: observer-admission-runtime
release_home: v19.0.0
---

# WarpGraph.audit.test.js has vacuous tests with conditional early returns

**Effort:** S

Two tests in WarpGraph.audit.test.js silently pass when the audit
feature is broken:

1. "dirty state -> audit skipped" uses if/else accepting EITHER
   outcome (audit succeeds OR is skipped). Cannot fail.
2. "audit commit tree contains receipt.cbor" does
   `if (!auditSha) { return; }` — passes with no assertion when
   audit ref is null.

## What's wrong

Conditional early returns in tests make them vacuous. If the code
under test is completely broken, the test still passes because it
exits before reaching any assertion. This is the same root cause
as the removeNode bug: tests that bless broken behavior.

## Suggested fix

Replace conditional returns with explicit assertions:
```javascript
// BAD: silently passes when broken
if (!auditSha) { return; }

// GOOD: fails loud when broken
expect(auditSha).not.toBeNull();
```

Remove the if/else that accepts both outcomes. A test must assert
ONE expected outcome, not accept all possibilities.
