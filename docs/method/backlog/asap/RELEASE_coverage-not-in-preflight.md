# Release preflight does not run coverage check

**Effort:** S
**Audit ref:** Comparison report, hidden finding #2

`scripts/release-preflight.sh` runs `npm run test:local` (line 96),
not `npm run test:coverage`. The coverage ratchet (97.71% in
`vitest.config.js`) is enforced only by `npm run test:coverage`,
which is not in the release pipeline.

Current state: coverage is 95.43% (below threshold). Preflight says
all 9 checks pass. You can tag and ship v17.0.0 with a failing
coverage gate and the release script won't notice.

## Suggested Fix

Replace `test:local` with `test:coverage` in the preflight script,
or add a 10th check that runs `test:coverage` separately. The
ratchet exists to prevent regressions — it needs to be wired to
the actual release gate.
