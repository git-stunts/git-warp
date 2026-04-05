# CI gate that audits all invariants on every PR

Every invariant in docs/invariants/ has a "How do you check?"
section with concrete commands. What if CI ran all of them?

A script — `scripts/audit-invariants.js` — that:

1. Reads each file in docs/invariants/
2. Extracts the check commands from the "How do you check?" section
3. Runs them
4. Reports pass/fail per invariant
5. Fails the CI job if any invariant is violated (excluding
   tracked suppressions)

The output:

```
INVARIANT AUDIT
  tick-confluence .............. PASS (7/7 tests)
  no-ambient-time ............. FAIL (3 unsuppressed violations)
  no-ambient-entropy .......... FAIL (2 unsuppressed violations)
  domain-purity ............... PASS
  holographic-boundary ........ PASS
  ...
  16 invariants checked, 14 passed, 2 failed
```

The ratchet: tracked suppressions (eslint-disable with backlog
references) don't count as failures. Only NEW unsuppressed violations
fail the gate. The count of suppressions is tracked in a baseline
file. If a PR adds a new suppression without a backlog item, CI fails.

This turns invariants from "things we wrote down" into "things we
enforce on every commit."
