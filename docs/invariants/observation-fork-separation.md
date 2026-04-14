# Observation / Fork Separation

## What must remain true?

Observation, replay, seek, and materialization are read-side acts only.
They do not by themselves create new causal truth.

If a user or debugger wants to continue from an earlier coordinate or
explore a "what if?" branch, that must happen through an explicit fork
into a strand rooted at an exact lane coordinate.

Debugger-created strands should default to scratch or author-only
speculative work, not silent shared publication. Shared admitted history
requires a later explicit promotion.

If such a strand is retained beyond scratch, the retained provenance
should be able to name creator, tool or session origin, fork basis, and
retention or revelation posture.

## Why does it matter?

The debugger must not become a second hidden graph system that quietly
changes history while pretending only to inspect it. If seek or replay
silently create strands, the read/write boundary collapses and the user
can no longer tell whether they are observing history or authoring new
causal structure.

This also carries the privacy side of the model. Counterfactual
debugging often needs real speculative lanes, but those lanes should not
default to public admitted history simply because they were created from
a TTD workflow.

## Paper grounding

- Paper VII's three-tier thinking room distinguishes Ephemeral Scratch,
  Author-Only Speculative Lanes, and Shared / Admitted Lanes.
- `docs/design/worldline-observer-strand-model.md` already separates
  observational seek from explicit strand creation.
- Observer projection remains read-side only; counterfactual creation is
  a distinct fork act.

## How do you check?

1. Observer or materialization APIs must remain read-only.
2. Any "continue from here" path must call an explicit fork/strand
   creation surface.
3. Debugger-created strands must carry an exact fork coordinate.
4. Promotion into shared admitted history must remain an explicit later
   act, not the default side effect of debugger speculation.
