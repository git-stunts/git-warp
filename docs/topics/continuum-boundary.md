# Continuum boundary

Use this page when a git-warp concept mentions Continuum evidence, witnessed
history, receipt families, or suffix admission.

git-warp is one runtime in the Continuum stack. git-warp owns local runtime
truth: WARP refs, patch history, replay, checkpoints, worldlines, observers,
optics, and strand mechanics. Continuum owns the shared boundary vocabulary for
exchanging witnessed history between runtimes, apps, debuggers, and agents.

## What git-warp owns

git-warp owns:

- graph patch admission into Git-backed WARP refs;
- deterministic replay and CRDT reduction;
- worldline, observer, optic, query, strand, sync, and diagnostic surfaces;
- local evidence objects that describe what the runtime actually observed;
- exportable Continuum-family artifacts from the package boundary.

## What Continuum owns

Continuum owns the cross-runtime language:

- evidence posture;
- artifact authority;
- receipt family shape;
- witnessed suffix language;
- transport-facing proof vocabulary.

Do not make git-warp docs imply that Continuum is a storage engine, a database,
or the runtime that executes graph reads. It is the boundary protocol layer.

## Current posture

Some Continuum-facing nouns are exported and runtime-backed. That does not mean
every target transport is shipped.

Current docs may describe:

- translated evidence posture on `Optic`;
- receipt and tick witness shells;
- Supported Outcome Settlement support-tier disclosure;
- generated Continuum-family inventory;
- witnessed suffix admission envelopes as boundary artifacts.

Current docs must not claim:

- native Continuum remote optic transport is shipped;
- live Echo/git-warp suffix exchange is shipped;
- common-basis distributed braid validation is shipped;
- Continuum replaces git-warp's local replay or storage model.

## Where it appears

Continuum should be explained here, then linked from:

- [Optic reads](optic-reads.md), for evidence posture;
- [Sync](sync.md), for future witnessed exchange boundaries;
- [Git substrate](git-substrate.md), for local runtime truth;
- generated API reference, for exact exported symbols.

## See also

- [Git substrate](git-substrate.md)
- [Optic reads](optic-reads.md)
- [Supported Outcome Settlement](supported-outcome-settlement.md)
- [Sync](sync.md)
