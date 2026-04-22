---
id: SPEC_claude-md-24-inaccuracies
blocked_by: []
blocks: []
---

# CLAUDE.md has 24 factual inaccuracies (3 critical)

**Effort:** M

CLAUDE.md is the primary context source for AI agents. It currently
claims the version is v14.0.0 (it's 16.0.0), references WarpGraph.js
(deleted — replaced by WarpApp/WarpCore/WarpRuntime), lists 5 ports
(there are 19), shows 6 adapters (there are 30), and has a directory
layout that's 2 major versions behind.

## What's wrong

- 3 CRITICAL: wrong version, deleted main API file, wrong architecture
- 7 HIGH: wrong port/adapter counts, missing directories, wrong paths
- 8 MEDIUM: wrong test counts, missing deps, stale references
- 6 LOW: LOC counts, minor path/naming issues

Every agent session starts by reading incorrect information.

## Suggested fix

Full sweep of CLAUDE.md: version numbers, file paths, architecture
diagram, directory layout, port/adapter lists, dependency table,
test counts, key source files. See docs/audits/2026-04-documentation-audit.md
for the complete list with line numbers.

Do NOT touch the rules sections (Git Rules, Zero Tolerance,
Engineering Doctrine, Code Conventions) — those are correct.
