# Self-healing CLAUDE.md — generated from codebase truth

CLAUDE.md decayed from 0 to 24 inaccuracies across 2 major versions.
The rules sections stayed correct because they don't reference
specific files. The factual sections rotted because they hardcode
paths, counts, and version numbers that drift on every release.

What if the factual sections were generated?

A script — `scripts/generate-claude-md.js` — that:

1. Reads `package.json` for version
2. Scans `src/ports/*.js` for the port list
3. Scans `src/infrastructure/adapters/*.js` for the adapter list
4. Walks `src/` for the directory layout
5. Counts test files and greps for `it(` to count cases
6. Reads `package.json` dependencies for the dep table
7. Identifies "Key Source Files" by fan-in (most-imported)

The script emits a fresh CLAUDE.md by stitching:
- **Static sections** (rules, doctrine, conventions) from a template
- **Generated sections** (architecture, layout, ports, adapters,
  deps, counts) from codebase analysis

Run it in CI on every release. If the generated output differs from
the committed file, CI fails with a diff showing what drifted.

CLAUDE.md becomes a living document that can't lie because it's
derived from the same source of truth the code is.

The template preserves human voice. The generator preserves facts.
Neither drifts alone.
