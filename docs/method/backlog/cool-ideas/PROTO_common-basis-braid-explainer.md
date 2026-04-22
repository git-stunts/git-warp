---
blocked_by: []
blocks: []
id: PROTO_common-basis-braid-explainer
---

# Common-basis braid explainer

The repo keeps saying pinned-base equality is too small and that braid semantics
should eventually normalize claims to a common basis. That is correct, and it
is still hard to see.

This idea is a local explainer surface, not just a theorem or a code cut.

## Why it is interesting

- it would show why identical `baseObservation` is too strict
- it would make the normalization story concrete for contributors
- it would help prevent "frozen overlay with a friendlier README" from staying
  the effective mental model

## Done looks like

- one explainer or interactive local artifact shows two or more lane claims,
  their bases, and the normalized common-basis comparison object
- the surface makes plurality visible instead of collapsing it into a fake
  merge preview
- the artifact is useful for both runtime work and doctrine/onboarding work

## Starting points

- `docs/audits/WARP_DRIFT.md`
- `docs/design/worldline-observer-strand-model.md`
- `src/domain/services/strand/`
