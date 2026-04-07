# VIZ: cut git-warp visualization surface in favor of warp-ttd

## Legend

VIZ — visualization / operator-facing rendering surface

## Problem

`git-warp` still carries an in-repo visualization surface
(`src/visualization/`, ASCII renderers, graph render helpers, related
CLI presentation paths) even though `~/git/warp-ttd` now exists as the
dedicated debugging and visualization tool.

That creates duplicated product surface and split ownership:

- `git-warp` owns substrate truth, replay, provenance, observers, and
  strands
- `warp-ttd` owns the debugger / playback / visualization experience

Keeping both encourages drift, duplicate maintenance, and coverage work
on code that is no longer strategically important.

## Proposal

Cut or sharply reduce the visualization features inside `git-warp` and
move future visualization investment to `warp-ttd`.

Practical shape:

- stop expanding `src/visualization/` as a product surface
- remove renderers and CLI display layers that are now duplicated by
  `warp-ttd`
- keep only substrate-facing data/export surfaces that `warp-ttd` can
  consume
- update docs so `git-warp` points operators to `warp-ttd` for rich
  visualization and playback work

## Why now

- The coverage cycle exposed that some remaining misses sit in
  visualization files that are likely not worth preserving.
- The repo now has a cleaner ownership split available.
- This reduces surface area before the next decomposition/refactor
  cycles.

## Impact

- Less duplicated UI / renderer maintenance inside `git-warp`
- Clearer architectural ownership between substrate and debugger
- Better focus for post-coverage god-object refactors
