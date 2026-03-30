# 2026-03-28 — README first 30 seconds

## Governing design docs and backlog

- OG-010 — IBM Design Thinking Pass Over Public APIs And README (deleted)
- README first 30 seconds (deleted)

## What landed

The README front door now:

- leads with `TL;DR for humans`
- puts install and first-use code before deeper theory
- explains that `git-warp` lives inside a normal Git repo rather than taking the repo over
- adds a conceptual glossary that bridges front-door API nouns and paper nouns

## Design alignment audit

- `TL;DR before theory`: aligned
- `quick start before deeper explanation`: aligned
- `plain-language repo framing`: aligned
- `conceptual glossary bridge`: aligned
- `worldline-first read boundary preserved`: aligned

## Drift

No meaningful drift in this slice.

One adjacent issue remains outside this slice: some internal source filenames still use legacy `Strand` and `WarpRuntime` terminology even though the public API no longer does.

## Resolution

Accept the README/front-door changes as aligned.

Track internal naming cleanup separately rather than mixing it into this PR-feedback slice.
