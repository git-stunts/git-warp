# Align Playback-Head And TTD Consumers After Read Nouns Stabilize


## Problem

Playback-head and TTD work depends on stable read-side nouns, but that
substrate work is not finished yet.

## Why This Matters

Debugger and playback consumers should follow the substrate model, not force it
prematurely.

## Promotion Trigger

Promote this item when the observer/worldline API is stable enough for external
consumers to target directly.

## Release home

Likely release home: `v20`.

This is downstream of the `v19` noun and envelope corrections. Playback-head
consumers should align to the slice-first runtime after the observer/read-side
seams are honest, not before.
