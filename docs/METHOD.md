# METHOD

Issues, a loop, and honest bookkeeping.

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

**GitHub Issues are the live work tracker.** A label is a lane, a
milestone is release scope, and repository files are durable evidence.
Legacy filesystem backlog cards are migration evidence, not the new
authority model.

**Process should be calm.** No sprints. No velocity. No burndown. Issues are
tiered by judgment through labels, and the loop stays small enough to finish
well.

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
  BEARING.md                        current direction signpost
  VISION.md                         north-star signpost
  METHOD.md                         local Method doctrine signpost
  method/
    backlog/                        legacy/migration-only backlog cards
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

## Work Tracker

GitHub Issues are the live tracker. Repository docs are the evidence ledger.
Issue labels carry Method scheduling state so community contributors can see
and discuss work without cloning the repository or reading local backlog
folders.

### Inbox

Anyone - human, agent, or community contributor - captures raw ideas as
GitHub Issues with `lane:inbox`. A sentence is enough. Add provenance in the
issue body or comments when origin or timing matters.

### Lanes

| Label | Purpose |
|------|---------|
| `lane:inbox` | Unprocessed intake. |
| `lane:asap` | Pull into a cycle soon. |
| `lane:up-next` | Next in line. |
| `lane:cool-ideas` | Not committed work. |
| `lane:bad-code` | Debt, rot, or structural risk. |
| `lane:backlog-root` | Migrated unlaned work that needs classification. |
| `lane:v18.0.0` and similar | Release-scoped work for the named lane. |

Numbered release lanes may also use release milestones or a broad
`lane:release` label, but the exact source lane label remains useful for
migration provenance.

### Naming

Issue titles are workflow identity. Keep them short, readable, and branch-safe.
Avoid issue numbers in branch names; active work branches derive from title
slugs.

```text
legend:PROTO
legend:HEX
legend:MODEL
legend:DX
```

Historical filesystem filenames may survive in archive paths and issue body
provenance. New work starts as a GitHub Issue.

### Promoting

When an issue is pulled into a cycle, it becomes a design doc:

```text
GitHub issue -> docs/design/<cycle>/<task>.md
```

The issue is labeled `work-in-progress` and linked from the design doc. Work
does not silently fall back into the queue.

### Commitment

Pull it and you own it - "you" meaning the named sponsors (human and
agent) in the design doc. It does not go back.

- **Finish** - hill met.
- **Pivot** - end early, write the retro. Remaining work re-enters
  GitHub Issues as a fresh issue with scoped context.

### Maintenance

End of cycle:

- Process `lane:inbox`. Promote, flesh out, or close with a disposition.
- Re-prioritize. What you learned changes what matters.
- Clean up. Merge duplicates, kill the dead.

Do not reorganize mid-cycle.

### Legacy Filesystem Backlog

`docs/method/backlog/**` is now a migration surface. Existing cards should be
imported into GitHub Issues with source-file provenance and then archived so
there is one live tracker. Archived cards remain evidence, not a parallel
planning database.

### Cycle types

Same loop regardless:

- **Feature** - design, test, build, ship.
- **Design** - the deliverable is docs, not code.
- **Debt** - pull from issues labeled `lane:bad-code`. The hill is
  "this no longer bothers us."

---

## Legends

A named domain that spans many cycles. Legends organize attention, not
timelines - they are reference frames, not milestones. A legend never
starts or finishes. It describes what it covers, who cares, what
success looks like, and how you know.

A legend label or historical filename prefix names the domain so tracker and
archive views remain searchable. Legends live in `docs/method/legends/` as
standalone documents.

The current legends in this repo are:

- **Program legends** — feature or release work grouped by initiative
  or surface. Active examples in this repo include `API`, `DX`,
  `HYGIENE`, `INFRA`, `PERF`, `PROTO`, `SLUDGE`, `TRUST`, `TS`,
  `TUI`, and `VIZ`.
- **Invariant legends** — debt grouped by the law it violates. These
  are the canonical legend labels for `lane:bad-code` issues:
  - `HEX` — hex boundary honesty
  - `BND` — boundary decode and validation honesty
  - `MODEL` — runtime-backed model honesty
  - `CAST` — no cast-cosplay or escape-hatch lies
  - `PORT` — capability and port-surface honesty
  - `OWN` — ownership and cohesion
  - `SUB` — substrate/storage/streaming integrity
  - `SPEC` — executable-spec honesty (tests, docs, mocks, residue)

Historical umbrella prefixes such as `CC` and `NDNM` remain in older
filenames and retros, but they are legacy identities rather than the
preferred current taxonomy. Archived backlog indexes may preserve older
groupings, but GitHub labels are the live grouping surface.

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

0. **Pull** - choose a GitHub Issue, mark it `work-in-progress`, and link it
   from `docs/design/<cycle>/`. You are now committed.

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
   - New debt to GitHub Issues labeled `lane:bad-code`.
   - Cool ideas to GitHub Issues labeled `lane:cool-ideas`.
   - Issue maintenance.

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
   Write the retro. File a new GitHub Issue for the remainder.
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

### GitHub Issues and repo evidence are the coordination layer

If you can answer these questions by reading the repo, you do not need
a standup:

- What is everyone working on? -> open design docs
- What is committed? -> each design doc names its sponsors and hill
- What is next? -> GitHub Issues labeled `lane:asap`
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
   feelings that do not yet have GitHub Issues.

`BEARING.md` is a signpost, not a status report. It summarizes
direction; it does not create commitments, replace GitHub Issues, or
record decisions that belong in design docs, retros, or issue discussion.
It is updated during ship sync after merge. On a solo project, that is
usually you. On a team, it is whoever merges last or owns the ship
sync. No scheduling, no rotation, no process.

If the bearing drifts without anyone noticing, that is the signal to
talk - not a meeting, just a conversation. The drift itself is the
agenda.

### Conflict in the tracker

Two people pulling conflicting `lane:asap` issues is a design-doc problem, not
a process problem. Active design docs are visible through the repo itself. If
your hill contradicts an active cycle's hill, you should see it at step 1.
Resolve it there or file it as a tension in `docs/BEARING.md`.

### What this does not add

No standups. No syncs. No status emails. No sprint planning. No retro
meetings. The retro is a document, not a ceremony. GitHub Issues are the live
tracker; the repo is the evidence ledger. Read both when context matters.

---

## Graveyard

Rejected work moves to `docs/method/graveyard/` with a note explaining
why. The graveyard prevents re-proposing without context. If you want
to resurrect something, you must address the note.

---

## Flow

```text
idea -> lane:inbox -> lane:cool-ideas -> lane:up-next -> lane:asap
  -> design/<cycle>/  (committed issue)
  -> RED -> GREEN -> playback (witness)
  -> retro/<cycle>/   (cycle packet closed)
  -> PR -> main
  -> ship sync (BEARING / CHANGELOG / release when meaningful)
      - or ->
  -> closed issue / graveyard evidence
```

---

## What this system does not have

No velocity. No required meetings. Milestones may carry release scope, but they
do not replace labels, design docs, or release evidence.

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
