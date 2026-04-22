---
id: DX_claudespeed-session-handoff
blocked_by: []
blocks: []
---

# CLAUDESPEED session handoff protocol

This session produced 30+ commits, 4 audit reports, 93 backlog items,
44 cool ideas, a boot order refactor, and a production readiness
verdict. The next agent will read CLAUDE.md and get a mental model
that's 24 inaccuracies behind reality.

What if session handoff were a first-class protocol?

At the end of every session, the agent writes a structured handoff:
- What shipped (commits, with one-line summaries)
- What's broken (known issues, failing tests, unfinished work)
- What changed architecturally (new files, deleted files, moved files)
- What the next agent needs to know that CLAUDE.md doesn't say yet
- The single most important thing to do next

The handoff lives at `.claude/session-handoff.md` (or similar). The
next session's first act: read the handoff, then verify it against
the codebase. Trust but verify.

This is Think, but structured. Think captures insights. The handoff
captures state. Together they give the next agent both context and
continuity.

The meta-insight: agents are stateless between sessions. Every
session starts from zero. The handoff is the bridge. The better
the bridge, the less time the next agent spends re-deriving what
the last one already knew.
