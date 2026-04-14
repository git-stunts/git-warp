# Update CONTRIBUTING.md .js references to .ts

**Audit ref:** DQ01-H-04

`.github/CONTRIBUTING.md` line 74 says:
> `test/unit/domain/WarpGraph.noCoordination.test.js` is non-negotiable

The file is now `.test.ts`. Line 53 says "ESLint on staged JS files"
but the repo is 100% TypeScript.

## Steps

1. Replace `.js` references with `.ts` throughout CONTRIBUTING.md.
2. Update pre-commit hook description to reflect current behavior.
