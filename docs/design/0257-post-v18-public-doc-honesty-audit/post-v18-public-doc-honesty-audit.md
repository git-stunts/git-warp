# Post-V18 Public Doc Honesty Audit

## Hill

Define a post-release public-doc audit that keeps README, VISION, BEARING,
release notes, and technical teardown aligned with what v18 actually shipped.

## Context

V18 touched the public story heavily. It added release notes, a technical
teardown, generated contract evidence, migration proof, and explicit non-goals.
Those docs are now high-value surfaces and therefore high-risk drift points.

The audit should focus on claims that can mislead users:

- v18 is graph-model convergence, not full native Continuum witnesshood;
- v18 carries accepted residual content/property compatibility risk;
- v18 does not provide end-to-end graph streaming reads and writes;
- Echo and git-warp are sibling Continuum participants;
- tag/publish state is separate from source metadata.

## User Stories

- As a new reader, I can learn what git-warp is without receiving stale v17 or
  overbroad v18 claims.
- As a release reviewer, I can catch documentation overclaims before tagging.
- As a future maintainer, I can keep VISION stable while BEARING changes at
  cycle boundaries.

## Acceptance Criteria

- Public docs agree on the current package line and release status.
- Public docs use the canonical WARP expansion.
- Public docs preserve the v18 non-claims around streaming and native
  witnesshood.
- Public docs keep git-warp positioned as an independent Continuum
  participant.

## Test Plan

- `rg -n "Recursive Witnessed Admission over Git|cold runtime|cold substrate"`
- `rg -n "streaming|witnesshood|18.0.0|17.0.1" README.md docs`
- `npx markdownlint` on edited docs.
- Link check public documentation paths.
