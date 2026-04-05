# No migration guide for v14 -> v15 -> v16 breaking changes

**Effort:** M

Three major versions shipped in ~3 months with significant breaking
changes (WarpGraph -> WarpApp/WarpCore, controller decomposition,
stream architecture, boot order refactor). No dedicated migration
guide exists. The CHANGELOG documents what changed but not how to
migrate.

## Suggested fix

Create docs/MIGRATION.md covering:
- v14 -> v15: WarpGraph replaced by WarpApp/WarpCore, method renames
- v15 -> v16: WarpApp API changes, new port surface
- Each section: old API -> new API, search/replace patterns,
  behavioral differences
