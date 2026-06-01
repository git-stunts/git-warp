---
id: DX_plumbing-to-gitplumbing-rename
feature: api-capabilities
blocked_by: []
blocks: []
---

# DX: Document Plumbing → GitPlumbing rename as breaking change

The `Plumbing` class was renamed to `GitPlumbing` in the `@git-stunts/plumbing` package, but this rename is not documented as a breaking change in the git-warp CHANGELOG or migration guide.

Consumers who import `Plumbing` by name (rather than as a default import) will break silently on upgrade. This needs to be called out in the v17 breaking changes section and in any migration documentation.

## Files of interest

- `CHANGELOG.md` — missing breaking change entry
- `docs/API_REFERENCE.md` — references may use old name
- `index.d.ts` — verify `GitPlumbing` type is correctly declared
