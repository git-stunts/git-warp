---
id: DX_v17-release-readiness-dashboard
blocked_by: []
blocks: []
feature: tooling-release
---

# V17 release readiness dashboard

Create a single local command that prints the v17 release truth in one
screen:

- lint/typecheck/test/consumer-typecheck status
- materialization residue count in source, tests, and docs
- `_materializeGraph` call sites
- v17 bad-code count
- docs-code materialization snippets
- outdated dependency summary
- npm audit status

The output should be boring Markdown or terminal tables so it can be
pasted into release notes or PR comments. This would make "are we ready
for v17?" inspectable without rerunning a manual audit.
