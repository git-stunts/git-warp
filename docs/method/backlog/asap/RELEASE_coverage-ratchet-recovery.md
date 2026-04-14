# Recover coverage ratchet — 95.43% vs 97.71% threshold

**Audit ref:** SR01-R2

`npm run test:coverage` exits with:
```
ERROR: Coverage for lines (95.43%) does not meet global threshold (97.71%)
```

2.28 percentage point regression. The preflight script runs `test:local`
(not `test:coverage`), so this won't block tagging but WILL block CI on
the release tag if coverage is checked there.

## Steps

1. Run `npm run test:coverage` to identify files below threshold.
2. The likely culprits are newly added `.ts` files that lost coverage
   attribution during the `.js` → `.ts` rename.
3. Add targeted tests for uncovered branches.
4. Do NOT lower the ratchet — bring coverage back above 97.71%.
