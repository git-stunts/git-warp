# Cycle 0006 — Witness

## Agent playback

### Can we state, for every noun, which paper concept it implements?

**Yes.** The noun mapping covers 25 codebase nouns across 5 categories
(core state, patch/tick, provenance, observer/worldline,
infrastructure). Each is mapped to its paper concept with a citation.

### Is there a clear recommendation for what to rename and what to leave alone?

**Yes.**

- **Rename now (next cycle):** WorldlineSource → Viewpoint hierarchy
  (R2). Misnamed, models the wrong concept, class hierarchy needed
  for P3/P7 compliance.
- **Rename soon:** Worldline class (R1). Not a worldline — it's a
  projection handle. Breaking API change, needs major version bump.
- **Grow, don't rename:** Observer (R3). Correct projection component,
  missing basis/accumulation. Additive, not breaking.
- **Leave alone:** All GREEN and YELLOW nouns.

## Human playback

Deferred to review.
