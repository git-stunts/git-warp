# Method Bootstrap

**Cycle:** 0001-method-bootstrap
**Type:** Design
**Pulled from:** User direction (2026-04-01)

## Sponsor human

James — wants a calm, filesystem-native process that survives
context switches and makes both agent and human work legible.

## Sponsor agent

Claude — needs unambiguous structure to find work, classify it,
and operate without asking "where does this go?"

## Hill

The Method directory structure exists, all existing backlog items
live in it under descriptive names, and the old B-number system is
gone. From this point forward, `ls docs/method/backlog/` is the
only backlog query.

## Playback questions

### Agent

- Can I find the next piece of work by running `ls` on a lane
  directory? **YES/NO**
- Can I classify a new idea into the right lane without asking the
  human? **YES/NO**
- Do any B-numbers remain in the repo? **NO**

### Human

- Does `ls docs/method/backlog/asap/` show me what matters most?
  **YES/NO**
- Can I understand what each backlog item is from its filename
  alone? **YES/NO**
- Is the old BACKLOG/ directory gone? **YES/NO**

## Non-goals

- Defining all legends upfront. Legends emerge from work.
- Migrating design docs or retrospectives — they stay where they
  are. The Method structure is forward-looking.
- Writing process.md or release.md content beyond moving existing
  docs into place.
- Code changes of any kind.
