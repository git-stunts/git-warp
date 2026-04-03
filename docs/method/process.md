# How cycles run

See [METHOD.md](../../METHOD.md) for the full philosophy. This file is
the quick-reference for operating a cycle.

## Starting a cycle

1. Pick work from a lane (`asap/` first, then `up-next/`).
2. Create `docs/design/<NNNN-slug>/` with the next sequential
   number.
3. Move the backlog file into the cycle directory as the design doc.
   Flesh it out: sponsor human, sponsor agent, hill, playback
   questions, non-goals.
4. You are now committed.

## During a cycle

- RED: write failing tests from playback questions.
- GREEN: make them pass.
- Do not reorganize the backlog mid-cycle.

## Ending a cycle

1. **Playback** — produce a witness artifact for each playback
   question. Agent answers agent questions. Human answers human
   questions. Write it down.
2. **PR** — open, review, merge to main.
3. **Retro** — write `docs/method/retro/<NNNN-slug>/`.
   - Drift check (mandatory).
   - New debt to `bad-code/`.
   - Cool ideas to `cool-ideas/`.
   - Backlog maintenance: process inbox, re-prioritize, merge
     duplicates, kill the dead.
4. **Release** — only when externally meaningful behavior changed.
   See [release.md](release.md).

## Outcomes

- **Hill met** — merge, close.
- **Partial** — merge what is honest. Retro explains the gap.
- **Not met** — write the retro anyway. Every cycle ends with one.
