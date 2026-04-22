---
id: DX_doc-freshness-ratchet
blocked_by: []
blocks: []
---

# Documentation freshness ratchet

CLAUDE.md had 24 inaccuracies. BEARING.md was 4 cycles stale. Nobody
noticed because no mechanism checks documentation against reality.

The ratchet: a CI job that greps documentation for falsifiable claims
and verifies them.

Examples of machine-checkable assertions:
- "v14.0.0" — compare against package.json
- "19 ports" — count `src/ports/*.js`
- "30 adapters" — count `src/infrastructure/adapters/*.js`
- "5549 tests" — run `grep -rc 'it(' test/ | tail -1`
- File paths like "src/domain/WarpGraph.js" — check existence

The script parses markdown for code-fenced paths and quoted file
references, then verifies each one exists. For numbers, it extracts
`\d+ (tests|ports|adapters|files)` patterns and cross-checks.

Not a full doc generator — just a smoke test. "Does every file path
in the docs point to a real file? Does every count match reality?"

If a release changes the port count from 19 to 20 and someone forgets
to update CLAUDE.md, CI catches it. The ratchet doesn't write docs —
it just refuses to let lies ship.
