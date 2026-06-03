# How cycles run

See [METHOD](../METHOD.md) for the full philosophy. This file is
the quick-reference for operating a cycle.

## Starting a cycle

1. Pick work from GitHub Issues. Prefer `lane:asap`, then `lane:up-next`, then
   the release lane when release-scoped work is active.
2. Create `docs/design/<NNNN-slug>/` with the next sequential
   number.
3. Create the design doc from
   [design-doc-template.md](design-doc-template.md). At minimum, name the
   linked issue, sponsors, hill, current truth, problem, scope, non-goals,
   proof surface, tests to write first, acceptance criteria, validation plan,
   playback/witness, tracker disposition, and retrospective.
4. If visible CLI, TUI, docs, report, or error text changes, name the changed
   strings and directionality assumptions. Do not invent localization gates;
   git-warp does not currently have localization support.
5. You are now committed.

## During a cycle

- RED: write failing tests from the proof surface.
- GREEN: make them pass.
- Design-doc assertions, inventory tests, and docs guards can support the
  evidence ledger, but they cannot be the only proof for implementation work.
- Do not reorganize the backlog mid-cycle.

## Ending a cycle

1. **Playback** — produce a witness artifact for each playback
   question. Agent answers agent questions. Human answers human
   questions. Write it down. Witnesses must be reproducible from
   committed commands, inputs, or mechanisms.
2. **Close** — write the retro and witness packet on the branch.
   - Drift check (mandatory).
   - New debt to `bad-code/`.
   - Cool ideas to `cool-ideas/`.
   - Backlog maintenance.
3. **PR / review** — review the full cycle packet until merge or
   rejection.
4. **Ship sync on `main`** — after merge, update `docs/BEARING.md`,
   `CHANGELOG.md`, and release notes when the cycle changes them.
   Only when externally meaningful behavior changed. See
   [release.md](release.md).

## Outcomes

- **Hill met** — close the packet, review, merge, ship sync.
- **Partial** — merge what is honest. Retro explains the gap.
- **Not met** — write the retro anyway. Every cycle ends with one.
