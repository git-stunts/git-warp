---
id: VIZ_live-ssjs-dashboard
blocked_by: []
blocks: []
---

# Live SSJS health dashboard

**Effort:** L

## Idea

Picture this: you open a dashboard and see every file in the codebase
as a node in a graph. Color tells the story — green means clean, yellow
means concern, red means violation. Node size is proportional to LOC.
Edges are imports. The architecture is literally visible.

You spot a red cluster around `src/domain/types/WarpTypesV2.js` and its
8 typedef-only op types. You see the yellow halo around the free
functions in `frontier.js`. You see the green core of the CRDT
primitives where every class validates its constructor arguments. The
health of the codebase is a picture, not a spreadsheet.

Each node's color is computed from a lightweight SSJS scorecard:
- P1: Does it use classes for domain concepts?
- P2: Do constructors validate?
- P3: No external tag switching?
- P5: No codec imports in domain?
- P7: `instanceof` over tag checks?

Click a node and the scorecard expands — specific violations, line
numbers, suggested fixes. The dashboard updates on every commit via CI.
A PR that introduces a new red node is immediately visible in the
diff view.

The terminal version uses the existing ELK layout + ASCII renderer —
`git warp ssjs-health` prints a character grid showing compliance
clusters. The web version uses the SVG renderer for an interactive
explorable map. Both read from the same underlying scorecard data
stored as a JSON artifact in CI.

## Why cool

Architecture health is usually invisible. You only discover rot when
you're already deep in a refactor. A live dashboard makes the invisible
visible. It turns "we should clean up WarpTypesV2" from a vague feeling
into a red blob you can point at. Social pressure from a green-to-red
regression is more powerful than any code review comment.
