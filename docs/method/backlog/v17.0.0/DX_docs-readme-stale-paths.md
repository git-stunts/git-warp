---
id: DX_docs-readme-stale-paths
blocked_by: []
blocks: []
feature: docs-dx
---

# Fix docs/README.md stale paths and add migration guide link

**Audit ref:** DQ01-M-03

`docs/README.md` references paths that may be stale:
- `docs/ROADMAP/COMPLETED.md` (line 63)
- `../.github/maintainers/documentation/style-guide.md` (line 74)

The docs index does NOT mention `docs/migrations/v17.0.0.md`, which is a
significant omission for a major version release.

## Steps

1. Verify all referenced paths resolve.
2. Remove or fix broken links.
3. Add migration guide (`docs/migrations/v17.0.0.md`) link to the index.
