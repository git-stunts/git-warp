# METHOD

The canonical METHOD document now lives at
[docs/METHOD.md](docs/METHOD.md).

This root file remains as a compatibility signpost for older links,
agent instructions, and historical docs that still point at
`/METHOD.md`.

## Cycles

A cycle is a unit of shipped work. Design, implementation,
retrospective. Numbered sequentially.

### Size

A cycle has no prescribed duration. It should be small enough that a
failed one teaches more than it costs. If you cannot describe the hill
in one sentence, the cycle is too big. Split it.

### The loop

0. **Pull** - choose from the backlog. Move it into
   `docs/design/<cycle>/`. You are now committed.

1. **Design** - write a design doc. Required sections:

   - Sponsor human
   - Sponsor agent
   - Hill (one sentence)
   - Playback questions - yes/no, both perspectives. Write them first.
   - Accessibility / assistive reading posture
   - Localization / directionality posture
   - Agent inspectability / explainability posture
   - Non-goals

   If a posture is not relevant, say so explicitly. Silence is not a
   position.

2. **RED** - write failing tests. Playback questions become specs.
   Default to agent surface first.

3. **GREEN** - make them pass.

4. **Playback** - produce a witness. The agent answers agent
   questions. The human answers user questions. Write it down.

   The **witness** is the concrete artifact - test output, transcript,
   screenshot, recording - that shows both answers. No clear yes means
   no. If the witness cannot be reproduced from committed commands,
   inputs, or mechanisms, the answer is still no. Observational
   artifacts may support the witness, but they do not carry the
   done-claim by themselves. If the hill claims accessibility,
   localization, or agent-facing explainability, witness those paths
   too.

5. **Close** - write the retro and witness packet on the branch.

   - Drift check (mandatory). Undocumented drift is the only true
     failure mode.
   - New debt to `bad-code/`.
   - Cool ideas to `cool-ideas/`.
   - Backlog maintenance.

   Closing the cycle packet does not mean `main` has accepted it yet.

6. **PR / review** - review the full cycle packet until merge or
   rejection.

7. **Ship sync on `main`** - after merge, update repo-level ship
   surfaces such as `docs/BEARING.md`, `CHANGELOG.md`, and release
   notes when the cycle changes them.

   Releases happen when externally meaningful behavior changes. Not
   every cycle is a release. Ship sync only happens on merged `main`
   state, not branch-local closeout state.

### Disagreement at playback

Both sponsors must say yes. When they disagree:

1. Name the disagreement in the witness. What does the agent see that
   the human does not, or vice versa?
2. If the gap is scoping - the hill was met but the answer is
   unsatisfying - the cycle is **partial**. Merge what is honest.
   Write the retro. File a new backlog item for the remainder.
3. If the gap is correctness - one sponsor believes the work is
   wrong - do not merge it. Return to RED or GREEN. If the work is
   abandoned instead of fixed, close the cycle as **not met** and write
   the retro.

The human does not automatically override the agent. The agent does
not automatically override the human. The design doc is the tiebreaker:
does the witness answer the playback questions or not?

### Outcomes

- **Hill met** - close the packet, review it, merge it, then ship sync.
- **Partial** - close the packet honestly, merge only what is honest,
  and let the retro explain the gap.
- **Not met** - cycle still concludes. Write the retro. A failed
  cycle with a good retro beats a successful one with no learnings. A
  failed cycle does not need to merge to end honestly.

Every cycle ends with a retro. Success is not required.

---

## Coordination

METHOD is designed for a solo developer working with an agent. It
scales to a team without adding meetings, roles, or synchronization
ceremonies. The mechanism is passive legibility.

### The filesystem is the coordination layer

If you can answer these questions by reading the repo, you do not need
a standup:

- What is everyone working on? -> open design docs
- What is committed? -> each design doc names its sponsors and hill
- What is next? -> `ls docs/method/backlog/asap/`
- What failed and why? -> `ls docs/method/retro/`
- What did we decide not to do? -> `ls docs/method/graveyard/`

If any of these are unclear, the docs are incomplete. Fix the docs,
not the process.

### BEARING.md

A single living document at `docs/BEARING.md`. One page, updated at
cycle boundaries - not mid-cycle. It answers three questions:

1. **Where are we going?** - the current priority (legend, theme, or
   plain English).
2. **What just shipped?** - last completed cycle, one line.
3. **What feels wrong?** - known tensions, open questions, gut
   feelings that do not yet have backlog items.

`BEARING.md` is a signpost, not a status report. It summarizes
direction; it does not create commitments, replace backlog items, or
record decisions that belong in design docs, retros, or the backlog.
It is updated during ship sync after merge. On a solo project, that is
usually you. On a team, it is whoever merges last or owns the ship
sync. No scheduling, no rotation, no process.

If the bearing drifts without anyone noticing, that is the signal to
talk - not a meeting, just a conversation. The drift itself is the
agenda.

### Conflict at the backlog

Two people pulling conflicting work from `asap/` is a design-doc
problem, not a process problem. Active design docs are visible through
the repo itself. If your hill contradicts an active cycle's hill, you
should see it at step 1. Resolve it there or file it as a tension in
`docs/BEARING.md`.

### What this does not add

No standups. No syncs. No status emails. No sprint planning. No retro
meetings. The retro is a document, not a ceremony. The repo is the
single source of truth. Read it.

---

## Graveyard

Rejected work moves to `docs/method/graveyard/` with a note explaining
why. The graveyard prevents re-proposing without context. If you want
to resurrect something, you must address the note.

---

## Flow

```text
idea -> inbox/ -> cool-ideas/ -> up-next/ -> asap/
  -> design/<cycle>/  (committed)
  -> RED -> GREEN -> playback (witness)
  -> retro/<cycle>/   (cycle packet closed)
  -> PR -> main
  -> ship sync (BEARING / CHANGELOG / release when meaningful)
      - or ->
  -> graveyard/
```

---

## What this system does not have

No milestones. No velocity. No ticket numbers. No required meetings.

METHOD is not a GitHub workflow, a pull-request cockpit, or a
forge-specific review protocol. It can live inside repos that use those
things, but its core contract is backlog discipline, cycle truth, and
reproducible witnesses at the repo level. Review tools may assist the
operator; they do not define the method.

The backlog is tiered by lane. Choice within a lane is judgment at
pull time. Coordination is reading the filesystem. That is enough.

---

## Naming

| Convention | Example | When |
|------------|---------|------|
| `ALL_CAPS.md` | `VISION.md`, `BEARING.md` | Signpost - root or `docs/` |
| `lowercase.md` | `doctrine.md` | Everything else |
| `<LEGEND>_<name>.md` | `CC_raw-error-purge.md` | Backlog with legend |
| `<name>.md` | `debt-trailer-codec.md` | Backlog without legend |
| `<cycle>/` | `0010-strand-speculation/` | Cycle directory |
