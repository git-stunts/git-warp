---
title: "Snapshot-backed checkpoint pin path skips stable checkpoint ref publication"
legend: PORT
---

# Snapshot-backed checkpoint pin path skips stable checkpoint ref publication

## Problem

`CheckpointController.createCheckpoint()` now has a snapshot-backed
path that:

- resolves an exact snapshot when present
- or materializes once, stores a snapshot record, and pins it

But that path returns the pinned snapshot id without publishing the
stable checkpoint ref/name that the legacy checkpoint path maintains.

That means the capability surface is no longer telling one truthful
story:

- internally, checkpoint creation is becoming snapshot promotion
- externally, checkpoint discoverability still depends on the legacy
  ref-publishing path

## Why this is bad

- callers can no longer assume "create checkpoint" also means
  "checkpoint is discoverable through the stable checkpoint handle"
- the repo ends up with unified snapshot storage semantics but split
  public checkpoint semantics
- playback for cycle `0034` passes the storage/control-plane law but
  fails the public contract law

## Desired fix

Make the snapshot-backed checkpoint path publish the same stable
checkpoint ref/name contract as the legacy path, or explicitly redefine
the public checkpoint API and update all discovery/read paths to match.
