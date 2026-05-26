# Post-V18 Storage Retirement Decision

## Hill

Decide whether the next engineering goalpost should continue raw
content/property storage retirement before starting v19 runtime doctrine work.

## Context

V18 deliberately accepts residual raw content/property compatibility
boundaries. That is honest, but it is still debt. The closeout audit now
guards drift, yet the repo still carries legacy compatibility spelling in
named boundaries.

The competing pressure is v19: observation, admission, and doctrine
convergence. Starting v19 while storage-plane debt remains visible may be
reasonable, but only if the debt is boxed and ratcheted tightly enough.

## User Stories

- As a maintainer, I can decide whether storage debt is a release-line risk or
  a manageable ratcheted backlog item.
- As a migration operator, I can trust that remaining legacy compatibility
  boundaries are named and tested.
- As a v19 planner, I can start observer/admission work without inheriting
  ambiguous v18 substrate claims.

## Acceptance Criteria

- The decision distinguishes total storage retirement from bounded residual
  compatibility.
- The decision identifies the next single raw boundary to retire if retirement
  continues first.
- The decision explains why v19 can or cannot start before full storage
  retirement.
- The closeout audit remains the executable guard for any deferred boundary.

## Test Plan

- Run the content/property closeout audit.
- Inspect each allowlisted boundary for ownership and reason.
- Verify release docs do not claim total raw storage retirement.
- Update the relevant backlog lane after the decision.
