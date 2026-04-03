# METHOD

A backlog, a loop, and honest bookkeeping.

## Principles

### Stances

**The agent and the human sit at the same table.** They see different
things. Both are named in every design. Both must agree before work
ships.

**Default to building the agent surface first** - it is the foundation
the human experience stands on. If the work is human-first exploratory
design, say so in the design doc.

**Agent surfaces must be explicit and inspectable.** If work is
agent-mediated, say what is agent-generated, why it exists, what
evidence it relies on, and what action it expects next.

**The filesystem is the database.** A directory is a priority. A
filename is an identity. Moving a file is a decision. `ls` is the
query.

**Process should be calm.** No sprints. No velocity. No burndown. A
backlog tiered by judgment, and a loop for doing it well.

### Design constraints

**Meaning must survive without decoration.** If the work only makes
sense with color, layout, motion, or shared visual context, the design
is unfinished. Rich interaction is valuable, but the underlying truth
must stand on its own.

**Accessibility is a product concern, not a fallback string path.**
Designs must name the linear reading model and reduced-complexity
experience, not assume the default operator.

**Localization is not translation after the fact.** Wording, wrapping,
formatting, and directionality are design constraints from the start.
Prefer logical `start`/`end` thinking over hardcoded left/right
assumptions.

### Quality gates

**Everything traces to a playback question.** If you cannot say which
question your work answers, you are drifting. Stop. Reconnect to the
design, or change it.

**Tests are the executable spec.** Design names the hill and the
playback questions. Tests prove the answers. No ceremonial prose
between intent and proof.

**If a claimed result cannot be reproduced, it is not done.**
Witnesses are not victory photos. They are rerunnable proof.

---

## Structure

```text
docs/
  method/
    backlog/
      inbox/                        raw ideas, anyone, anytime
      asap/                         do this now
      up-next/                      do this soon
      cool-ideas/                   experiments, wild thoughts
      bad-code/                     tech debt
      *.md                          everything else
    legends/                        named domains
    retro/<cycle>/<task>.md         retrospectives
    graveyard/                      rejected ideas
    guide.md                        operator advice and non-doctrinal practice notes
    process.md                      how cycles run
    release.md                      how releases work
  design/
    <cycle>/<task>.md               cycle design docs
    *.md                            living documents
```

Repo signposts live at root or one level into `docs/`. `README.md` is
the standing root exception; every other signpost uses `ALL_CAPS.md`.
Deeper than that, it is not a signpost.

---

## Signposts

METHOD expects a few bounded repo-level signposts. They summarize the
state of the repo; they do not create commitments.

| Signpost | Role |
|----------|------|
| `README.md` | The operating doctrine and filesystem shape. |
| `docs/BEARING.md` | Current direction, last shipped cycle, and tensions at cycle boundaries. |
| `docs/VISION.md` | A bounded executive synthesis grounded in repo-visible sources. |

Generated signposts should carry generation metadata and a source
manifest. Unless they say otherwise explicitly, they are making
artifact-history claims, not semantic-provenance claims.

---

## Backlog

Markdown files. Each describes work worth doing. The filesystem is
the index.

### Inbox

Anyone - human or agent - drops ideas in at any time. A sentence is
enough. No legend, no scope, no ceremony. Capture it. Keep moving.
The inbox is processed during maintenance.

### Lanes

| Lane | Purpose |
|------|---------|
| `inbox/` | Unprocessed. |
| `asap/` | Pull into a cycle soon. |
| `up-next/` | Next in line. |
| `cool-ideas/` | Not commitments. |
| `bad-code/` | It works, but it bothers you. |

Anything else sits in the backlog root.

### Naming

Legend prefix if applicable. No numeric IDs.

```text
PROTO_strand-lifecycle.md
CC_raw-error-purge.md
debt-trailer-codec-dts.md
```

### Promoting

When a backlog item is pulled into a cycle, it becomes a design doc:

```text
backlog/asap/CC_strand-service-decomposition.md -> design/<cycle>/strand-service-decomposition.md
```

The backlog file is removed. Work does not live in two places.

### Commitment

Pull it and you own it - "you" meaning the named sponsors (human and
agent) in the design doc. It does not go back.

- **Finish** - hill met.
- **Pivot** - end early, write the retro. Remaining work re-enters
  the backlog as a new item with fresh scope.

### Maintenance

End of cycle:

- Process inbox. Promote, flesh out, or bury.
- Re-prioritize. What you learned changes what matters.
- Clean up. Merge duplicates, kill the dead.

Do not reorganize mid-cycle.

### Cycle types

Same loop regardless:

- **Feature** - design, test, build, ship.
- **Design** - the deliverable is docs, not code.
- **Debt** - pull from `bad-code/`. The hill is "this no longer
  bothers us."

---

## Legends

A named domain that spans many cycles. Legends organize attention, not
timelines - they are reference frames, not milestones. A legend never
starts or finishes. It describes what it covers, who cares, what
success looks like, and how you know.

A legend code prefixes backlog filenames so that `ls` reveals domain
load at a glance. Legends live in `docs/method/legends/` as standalone
documents.

The current legends in this repo are:

- `CC` (CLEAN_CODE) - structural quality: god object decomposition,
  raw error replacement, type boundary cleanup, file size limits, lint
  ratchets.
- `NDNM` (NO_DOGS_NO_MASTERS) - god object decomposition and
  phantom-type liberation. Break up the gods. Free their vassals.

Other legend codes in active use: `PROTO`, `TRUST`, `VIZ`, `TUI`,
`DX`, `PERF`.

Not every METHOD repo needs these exact legends. Legends are local to
the repo and should reflect the domains that actually organize its
work.

---

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
