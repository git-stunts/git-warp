---
id: DX_agent-onboarding-test
blocked_by: []
blocks: []
feature: browser-viz
---

# Agent onboarding smoke test

An agent reads CLAUDE.md, builds a mental model, then works. If
CLAUDE.md lies, the agent wastes time looking for files that don't
exist, using wrong API names, and building on wrong assumptions.

What if there were a test that simulates agent onboarding?

The test:
1. Parses CLAUDE.md for every file path mentioned
2. Verifies each path exists
3. Parses every class/function name referenced
4. Greps the codebase for each one
5. Checks that API examples in CLAUDE.md actually compile
6. Verifies the architecture diagram matches the import graph

If the test passes, an agent reading CLAUDE.md will form a correct
mental model. If it fails, the test output shows exactly what's
wrong: "CLAUDE.md references WarpGraph.js but the file does not
exist. Did you mean WarpApp.js?"

This is a unit test for documentation. The assertion is: "the
mental model this document creates matches reality."

Could run as a BATS test or a vitest file. The fixture is CLAUDE.md.
The oracle is the filesystem.
