# V18 Residual Boundary Next Retirement

## Hill

Pick the next raw content/property compatibility boundary to retire after v18,
using the executable closeout audit as the source of truth.

## Context

The closeout audit already prevents unreviewed drift. It also gives the next
retirement slice a concrete starting point: reduce the allowlist or narrow one
remaining exception.

The highest-value next boundary is not necessarily the largest file. The right
choice is the boundary whose retirement reduces future migration, projection,
or public-read risk without destabilizing the release line.

## User Stories

- As a maintainer, I can choose the next retirement target from evidence
  instead of frustration.
- As a reviewer, I can see that a retirement slice reduces the audit surface.
- As a migration operator, I can trust that legacy compatibility remains
  backward-compatible while the internal raw boundary shrinks.

## Acceptance Criteria

- The next retirement candidate is named with file paths and current audit
  reason.
- The slice defines whether it retires a whole file, a pattern family, or a
  narrower inline exception.
- The audit is tightened in the same slice that retires the boundary.
- Regression tests prove public read/write behavior remains compatible.

## Test Plan

- Run `npm exec vitest run test/unit/scripts/v18-content-property-closeout-audit.test.ts`.
- Inspect the current audit allowlist before choosing a boundary.
- Add targeted tests for the retired boundary.
- Run `npm run test:local` or the relevant focused suite after the cut.
