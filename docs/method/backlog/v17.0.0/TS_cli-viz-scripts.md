---
id: TS_cli-viz-scripts
blocks:
  - TS_publish-pipeline
blocked_by:
  - TS_convert-remaining-js
feature: runtime-boundaries
---

# Convert CLI, visualization, and scripts to TypeScript

Phase 4 of cycle 0013. Three directories:

| Directory | Files | LOC |
|-----------|-------|-----|
| `bin/` | 40 | 8,944 |
| `src/visualization/` | 26 | 4,029 |
| `scripts/` | 25 | 2,301 |

Total: 91 files, ~15,274 LOC.

## Over-ceiling files

Source ceiling: 500 LOC. Scripts ceiling: 300 LOC.

### Over 500 LOC (source)

| File | LOC | Split strategy |
|------|-----|----------------|
| `bin/presenters/text.js` | 1,344 | Split by command: one presenter function per file |
| `bin/cli/commands/doctor/checks.js` | 584 | Split: structural checks vs data checks |
| `bin/cli/commands/seek.js` | 537 | Extract seek pipeline stages into helpers |
| `src/visualization/renderers/ascii/seek.js` | 672 | Split: timeline vs detail panels |
| `src/visualization/renderers/ascii/graph.js` | 463 | Under ceiling, no split needed |
| `src/visualization/renderers/ascii/history.js` | 443 | Under ceiling |

### Over 300 LOC (scripts)

| File | LOC | Split strategy |
|------|-----|----------------|
| `scripts/check-dts-surface.js` | 322 | Barely over; may shrink after JSDoc removal |
| `scripts/lint-markdown-code-samples.js` | 282 | Under ceiling |

## Sludge census

### CLI sludge

| Pattern | Location | Fix |
|---------|----------|-----|
| Two-layer parseArgs with `node:util` + Zod | `infrastructure.js`, `schemas.js` | Type the Zod schemas; `parseArgs` return becomes typed |
| `@type` casts on parsed args | Every command handler | Real parameter types from Zod inference |
| Untyped `emit()` payloads | `shared.js`, every command | Define `EmitPayload` discriminated union per command |
| `CliError` string codes | `infrastructure.js` | Use string literal union type for error codes |
| `COMMANDS` map values typed as `Function` | `warp-graph.js` | Type as `(args: ParsedArgs) => Promise<void>` |
| Result bags from `openGraph()` | `shared.js` | Named `OpenGraphResult` type |

### Visualization sludge

| Pattern | Location | Fix |
|---------|----------|-----|
| Untyped render function params | All ascii renderers | Define `RenderContext` per command |
| Magic numbers (cellW=8, cellH=4) | `ascii/graph.js` | Named constants |
| PositionedGraph shape is a plain object | `elkLayout.js` | Already has a typedef; promote to class or named type |
| `elkjs` dynamic import typed as `any` | `elkAdapter.js` | Type the import with ELK's published types |

### Scripts sludge

| Pattern | Location | Fix |
|---------|----------|-----|
| `process.exit()` sprinkled | Most scripts | Fine for scripts; keep as-is |
| No shared types for ratchet data | `scripts/ratchet/*.js` | Define `RatchetSnapshot` type |
| `require()` in ESM scripts | None found | Clean |

## Conversion groups

### Group 1: Visualization utilities (5 files, ~220 LOC)

Leaves with no internal dependents.

- `utils/ansi.js` (20 LOC)
- `utils/unicode.js` (52 LOC)
- `utils/truncate.js` (65 LOC)
- `utils/time.js` (50 LOC)
- `index.js` (32 LOC) — barrel re-export

### Group 2: Visualization layouts (3 files, ~444 LOC)

- `layouts/converters.js` (94 LOC)
- `layouts/elkAdapter.js` (130 LOC) — type the `elkjs` dynamic import
- `layouts/elkLayout.js` (220 LOC) — promote `PositionedGraph` to named type

### Group 3: ASCII renderers (12 files, ~3,320 LOC)

Shared helpers first, then per-command renderers:

1. `ascii/symbols.js` (33 LOC)
2. `ascii/colors.js` (13 LOC)
3. `ascii/box.js` (16 LOC)
4. `ascii/table.js` (17 LOC)
5. `ascii/formatters.js` (88 LOC)
6. `ascii/opSummary.js` (81 LOC)
7. `ascii/progress.js` (54 LOC)
8. `ascii/index.js` (14 LOC) — barrel
9. `ascii/info.js` (288 LOC)
10. `ascii/path.js` (222 LOC)
11. `ascii/check.js` (355 LOC)
12. `ascii/materialize.js` (304 LOC)
13. `ascii/history.js` (443 LOC)
14. `ascii/graph.js` (463 LOC)
15. `ascii/seek.js` (672 LOC) — **split required**

**seek.js split plan:**
- `ascii/seekTimeline.ts` (~300 LOC) — timeline rendering
- `ascii/seekDetail.ts` (~300 LOC) — detail panel rendering
- `ascii/seek.ts` (~100 LOC) — composition entry point

### Group 4: SVG renderer (1 file, 232 LOC)

- `renderers/svg/index.js` (232 LOC)

Pure string templating. Straight conversion.

### Group 5: CLI infrastructure (5 files, ~1,240 LOC)

These are shared across all commands. Convert first.

1. `cli/types.js` (113 LOC) — JSDoc typedefs become real types
2. `cli/infrastructure.js` (453 LOC) — `parseArgs`, `parseCommandArgs`, `CliError`
3. `cli/schemas.js` (292 LOC) — Zod schemas, use `z.infer<>` for types
4. `cli/shared.js` (291 LOC) — `openGraph`, `wireSeekCache`, `emit`
5. `cli/time-travel-shared.js` (174 LOC) — shared time-travel helpers

**Key pattern:** Zod schemas in `schemas.ts` should export inferred
types: `export type SeekArgs = z.infer<typeof seekSchema>`. Command
handlers then import the type, not the schema, for their parameter
annotations.

### Group 6: CLI command handlers (26 files, ~5,700 LOC)

Convert leaves first (commands with no sub-commands), then composites.

**Simple commands (under 300 LOC):**
- `reindex.js` (41), `registry.js` (40), `verify-index.js` (62),
  `bisect.js` (109), `history.js` (97), `trust.js` (100),
  `materialize.js` (104), `verify-audit.js` (124), `info.js` (139),
  `install-hooks.js` (153), `patch.js` (148), `path.js` (170)

**Medium commands (300-500 LOC):**
- `check.js` (207), `query.js` (256), `tree.js` (232)

**Over-ceiling commands:**
- `seek.js` (537) — extract seek pipeline stages
- `doctor/checks.js` (584) — split structural vs data checks

**Sub-command composites:**
- `strand.js` (64) — dispatcher
  - `strand/list.js` (34), `strand/show.js` (42), `strand/drop.js` (41),
    `strand/create.js` (75), `strand/braid.js` (63),
    `strand/materialize.js` (76), `strand/compare.js` (102),
    `strand/transfer-plan.js` (87)
- `debug.js` (60) — dispatcher
  - `debug/shared.js` (342), `debug/timeline.js` (372),
    `debug/receipts.js` (308), `debug/conflicts.js` (289),
    `debug/coordinate.js` (165), `debug/provenance.js` (116)
- `doctor/index.js` (269), `doctor/checks.js` (584),
  `doctor/codes.js` (46), `doctor/types.js` (89)

### Group 7: Presenters (3 files, ~1,760 LOC)

- `presenters/json.js` (93 LOC) — straight conversion
- `presenters/index.js` (322 LOC) — presenter dispatcher
- `presenters/text.js` (1,344 LOC) — **split required**

**text.js split plan:** One file per command's text presenter:
- `presenters/text/info.ts` (~150 LOC)
- `presenters/text/query.ts` (~200 LOC)
- `presenters/text/seek.ts` (~250 LOC)
- `presenters/text/check.ts` (~150 LOC)
- `presenters/text/materialize.ts` (~150 LOC)
- `presenters/text/history.ts` (~100 LOC)
- `presenters/text/path.ts` (~100 LOC)
- `presenters/text/shared.ts` (~100 LOC) — shared formatting helpers
- `presenters/text/index.ts` (~50 LOC) — barrel

### Group 8: Entrypoint (1 file, 119 LOC)

- `warp-graph.js` (119 LOC) — type the `COMMANDS` map

### Group 9: Scripts (25 files, ~2,300 LOC)

Scripts stay as `.js` if they are shell scripts (`.sh`). JS scripts
convert to `.ts`:

**Ratchet family (11 files, ~680 LOC):**
- `ratchet/sanitizeBranchName.js` (7), `ratchet/extractTypecheckErrorCount.js` (7),
  `ratchet/buildSnapshotPath.js` (11), `ratchet/formatDelta.js` (12),
  `ratchet/listSnapshotPaths.js` (22), `ratchet/writeSnapshot.js` (30),
  `ratchet/readSnapshot.js` (40), `ratchet/createSnapshot.js` (55),
  `ratchet/extractVitestCounts.js` (55), `ratchet/diffSnapshots.js` (60),
  `ratchet/extractEslintCounts.js` (83), `ratchet/parseSnapshot.js` (93)

Define a `RatchetSnapshot` type shared by all ratchet scripts.

**Standalone scripts (7 files):**
- `coverage-ratchet.js` (19), `setup-hooks.js` (38),
  `ratchet-delta.js` (77), `ratchet-snapshot.js` (108),
  `ban-nondeterminism.js` (107), `ts-policy-check.js` (238),
  `check-dts-surface.js` (322)

**Shell scripts (keep as `.sh`):**
- `lint-ratchet.sh` (47), `release-preflight.sh` (136),
  `install-git-warp.sh` (258), `uninstall-git-warp.sh` (139),
  `hooks/post-merge.sh` (55)

## Execution order

1. Visualization utilities (Group 1)
2. Visualization layouts (Group 2)
3. ASCII renderers (Group 3) — split `seek.js`
4. SVG renderer (Group 4)
5. CLI infrastructure (Group 5)
6. CLI simple commands (Group 6, under-300 subset)
7. CLI medium + over-ceiling commands (Group 6, remainder) — split `seek.js`, `doctor/checks.js`
8. CLI sub-command composites (Group 6, strand/debug/doctor)
9. Presenters (Group 7) — split `text.js`
10. Entrypoint (Group 8)
11. Scripts (Group 9)

Every commit is green. Run `npm run typecheck` + `npm run lint` +
`npm run test:local` after each group.

## Test files

- Visualization: `test/unit/visualization/`
- CLI: `test/bats/` (integration), no unit tests for most commands
- Scripts: `test/unit/scripts/` if it exists; otherwise tested
  indirectly via `npm run ratchet:snapshot` etc.
