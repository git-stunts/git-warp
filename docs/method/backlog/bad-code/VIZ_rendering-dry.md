# Scattered DRY violations across visualization renderers

**Effort:** S

## What's wrong

Multiple small duplications across visualization code:

- Box-drawing chars defined in `graph.js` vs `info.js` with different key names.
- Unicode block chars repeated in `progress.js`, `check.js`, `materialize.js`.
- `tombstoneBar` duplicates `progressBar` logic with inverted thresholds.
- `info.js` and `seek.js` bypass `box.js` and import `boxen` directly.
- `seek.js` has its own `truncateDisplay` duplicating `truncate.js`.
- `timeAgo` duplicates `formatAge`.

## Suggested fix

- Centralize box-drawing and Unicode block chars in a `symbols.js` module.
- Parameterize `progressBar` for custom thresholds instead of duplicating.
- Route all `boxen` usage through `box.js`.
- Use `truncate.js` everywhere. Share duration formatting via a single utility.
