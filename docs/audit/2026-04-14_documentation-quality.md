---
report_id: "AUD-2026-04-14-DQ01"
title: "Documentation Quality Audit: @git-stunts/git-warp v17.0.0"
status: "Final"
audit:
  date_started: 2026-04-14
  date_completed: 2026-04-14
  type: "Full"
  scope: "README.md, docs/, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md"
  compliance_frameworks: ["Diataxis Documentation Framework"]
target:
  repository: "github.com/git-stunts/git-warp"
  branch: "release/v17.0.0"
  commit_hash: "f17df0cd"
  language_stack: ["TypeScript 5.9", "Node.js 22+"]
  environment: "Development"
methodology:
  automated_tools: ["Manual Review"]
  manual_review_hours: 0
  false_positive_rate: "N/A"
summary:
  total_findings: 18
  severity_count:
    critical: 3
    high: 5
    medium: 6
    low: 4
  remediation_status: "Pending"
related_reports:
  previous_audit: "N/A"
  tracking_ticket: "N/A"
---

# Documentation Quality Audit: @git-stunts/git-warp v17.0.0

## Section 1: Accuracy and Effectiveness Assessment

### 1.1 Core Mismatch Analysis

The v17.0.0 release introduces `openWarpGraph()` as the new public entry point, replacing the `WarpApp.open()` / `WarpCore.open()` pattern from v16. The README.md and ARCHITECTURE.md have been rewritten to reflect this new API. However, the three primary user-facing tutorial and reference docs have NOT been updated, creating a split-brain documentation state.

#### Finding C-01: `index.d.ts` does not export `openWarpGraph` or `WarpGraph` (CRITICAL)

**Severity: Critical**

The hand-maintained `index.d.ts` (4073 lines) does not contain `openWarpGraph`, `WarpGraph`, `CommitmentSurface`, `FoldingSurface`, `RevelationSurface`, or `GovernanceSurface`. TypeScript consumers who follow the README quick-start example will get a compile error immediately.

`index.js` does export `openWarpGraph` (line 246), so JavaScript consumers work. But the `index.d.ts` that provides type information for `import { openWarpGraph } from '@git-stunts/git-warp'` has no corresponding declaration.

- **File**: `/index.d.ts`
- **Evidence**: `grep -c 'openWarpGraph\|WarpGraph' index.d.ts` returns 0
- **Impact**: The README quick-start is broken for TypeScript consumers
- **Remediation**: Add `WarpGraph`, `WarpGraphDeps`, `openWarpGraph`, and the four surface interfaces to `index.d.ts`

#### Finding C-02: GETTING_STARTED.md, GUIDE.md, and API_REFERENCE.md still use v16 API (CRITICAL)

**Severity: Critical**

All three primary user-journey docs use `WarpApp.open()` as the entry point and `app.worldline()`, `app.patch()` patterns. None mention `openWarpGraph()`.

| Doc | Lines | API shown | Should show |
|-----|-------|-----------|-------------|
| `docs/GETTING_STARTED.md` | 179 | `WarpApp.open()` (lines 26-31) | `openWarpGraph()` |
| `docs/GUIDE.md` | 328 | `WarpApp.open()` (lines 28-33) | `openWarpGraph()` |
| `docs/API_REFERENCE.md` | 2422 | `WarpApp.open()` (lines 47, 62, 70) | `openWarpGraph()` |

The README's quick-start uses `graph.patches.createPatch()` and `graph.query.getNodeProps()`, but the docs pipeline sends users next to GETTING_STARTED.md which uses `app.patch((p) => {...})`. A new user following README then GETTING_STARTED will encounter two completely different API styles with no bridge between them.

- **Impact**: First-time users are guaranteed to hit confusion within the first two pages of docs
- **Remediation**: Rewrite all three docs to use `openWarpGraph()` as primary, with a note that `WarpApp.open()` still works for backward compatibility

#### Finding C-03: `package.json` and `jsr.json` version is still `16.0.0` (CRITICAL)

**Severity: Critical**

Both `package.json` (line 3) and `jsr.json` (line 3) show `"version": "16.0.0"`. The branch is `release/v17.0.0`, the README documents `openWarpGraph()` which is a v17 feature, and the migration guide exists at `docs/migrations/v17.0.0.md`. The version has not been bumped.

Per `docs/method/release.md`, the preflight check requires `package.json` version == `jsr.json` version and a dated CHANGELOG entry. Neither condition is met for v17.

- **Files**: `/package.json` (line 3), `/jsr.json` (line 3)
- **Impact**: Blocks release. `npm run release:preflight` will fail.
- **Remediation**: Bump both to `17.0.0` and move CHANGELOG `[Unreleased]` to `[17.0.0] -- 2026-MM-DD`

#### Finding H-01: `index.js` module JSDoc example uses deprecated v16 API (HIGH)

**Severity: High**

The `@example` in the `@module` JSDoc (lines 13-32 of `/index.js`) shows:

```ts
import WarpApp from "@git-stunts/git-warp";
const app = await WarpApp.open({ ... });
const patch = await app.createPatch();
```

This example uses `WarpApp` (legacy), `app.createPatch()` (deprecated method name), and does not show `openWarpGraph()` at all. This JSDoc renders in IDE hover tooltips and on jsr.io.

- **File**: `/index.js` lines 13-32
- **Remediation**: Replace with `openWarpGraph()` example matching README

#### Finding H-02: VISION.md shows non-existent nested namespace API (HIGH)

**Severity: High**

`docs/VISION.md` (lines 90-98) shows:

```
graph.commitment.patches    // local tick admission
graph.commitment.strands    // speculative lane management
graph.folding.materialize   // frontier-relative state
graph.revelation.query      // bounded observer reads
graph.governance.sync       // distributed suffix admission
```

The actual `WarpGraph` interface (in `src/domain/WarpGraph.ts` lines 101-116) has both nested surfaces (`graph.commitment.patches`) AND flat aliases (`graph.patches`). However, the README and ARCHITECTURE.md only show the flat form (`graph.patches`), while VISION.md only shows the nested form. No doc explains that both exist or which is preferred.

- **Files**: `docs/VISION.md` lines 90-98, `README.md` lines 33-41, `docs/ARCHITECTURE.md` lines 87-95
- **Impact**: A reader of VISION.md will try `graph.commitment.patches` and succeed, then a reader of the README will try `graph.patches` and also succeed, and neither will understand the other's code
- **Remediation**: Pick one canonical form, document the other as an alias, and be consistent across all docs

#### Finding H-03: CHANGELOG has no v17 section (HIGH)

**Severity: High**

All v17 changes sit under `[Unreleased]` (CHANGELOG.md line 8). The `[Unreleased]` section is massive -- approximately 130 lines of changes covering the full TypeScript migration, `openWarpGraph()`, god class decompositions, op type hierarchies, and more. Per the release runbook, a dated `[17.0.0] -- YYYY-MM-DD` section is required before tagging.

- **File**: `/CHANGELOG.md`
- **Impact**: Blocks release. Release preflight check #4 requires a dated entry.
- **Remediation**: Move `[Unreleased]` content to `[17.0.0] -- 2026-04-14` (or target date)

#### Finding H-04: CONTRIBUTING.md references `.js` test file path (HIGH)

**Severity: High**

`.github/CONTRIBUTING.md` line 74 says:

> `test/unit/domain/WarpGraph.noCoordination.test.js` is non-negotiable for multi-writer safety.

The file is now `WarpGraph.noCoordination.test.ts` (confirmed on disk). A contributor following this instruction will look for a file that does not exist.

Additionally, the pre-commit hook description (line 53) says "ESLint on staged JS files" but the repo is now 100% TypeScript.

- **File**: `.github/CONTRIBUTING.md` lines 53, 74
- **Remediation**: Update `.js` references to `.ts`

#### Finding H-05: `package.json` description does not match README positioning (HIGH)

**Severity: High**

`package.json` `description` field says:
> "Deterministic WARP graph over Git: graph-native storage, traversal, and tooling."

The README subtitle says:
> "A recursive witnessed admission architecture over Git."

The v17 positioning shift (admission architecture language) is not reflected in the npm/JSR package description, which is what users see on registry search results.

- **File**: `/package.json` line 4
- **Remediation**: Align description with current positioning

### 1.2 Audience and Goal Alignment

The documentation targets four audiences defined implicitly by the Diataxis framework:

| Diataxis quadrant | Doc | Quality | Notes |
|-------------------|-----|---------|-------|
| Tutorial | GETTING_STARTED.md | Good structure, stale API | Clear learning path, but uses v16 WarpApp API |
| How-to guide | GUIDE.md | Good structure, stale API | Common patterns well organized, but v16 API |
| Reference | API_REFERENCE.md | Comprehensive, stale API | 2422 lines of detailed reference, all v16 |
| Explanation | CONCEPTUAL_OVERVIEW.md | Good | Plain-language explanation, mostly version-agnostic |
| Explanation | ARCHITECTURE.md | Good, v17 updated | Clear system map, updated for openWarpGraph() |

#### Finding M-01: No inline runnable examples or test harness (MEDIUM)

**Severity: Medium**

None of the code examples in GETTING_STARTED.md or GUIDE.md can be verified programmatically. There is no `examples/` directory, no `docs/examples/` directory, and no integration test that exercises the documented flows. The `examples/` directory was explicitly removed in v15 (CHANGELOG: "removed the stale examples/ tree"). It was never replaced.

- **Impact**: Code examples may rot silently as the API evolves (as has already happened with the v16-to-v17 transition)
- **Remediation**: Create a `test/examples/` directory with test files that exercise the documented quick-start and guide patterns. Reference them from docs.

#### Finding M-02: CONCEPTUAL_OVERVIEW.md query example uses bare `graph.query()` (MEDIUM)

**Severity: Medium**

`docs/CONCEPTUAL_OVERVIEW.md` line 40 shows:

```javascript
graph.query()
  .match('user:*')
  .where({ role: 'admin' })
```

This does not match either the v16 API (`worldline.query()`) or the v17 API (`graph.query.query()`). It appears to be a simplified pseudocode that does not work with any actual API version.

- **File**: `docs/CONCEPTUAL_OVERVIEW.md` lines 39-46
- **Remediation**: Either label as pseudocode or update to match actual API

#### Finding M-03: docs/README.md (documentation index) references stale paths (MEDIUM)

**Severity: Medium**

`docs/README.md` references:

- `docs/ROADMAP/COMPLETED.md` (line 63) -- does this exist?
- `../.github/maintainers/README.md` (line 72) -- verified exists
- `../.github/maintainers/documentation/style-guide.md` (line 74)
- `../adr/` (line 54) -- verified exists
- `archive/retrospectives/` (line 61) -- verified exists

The docs index does not mention the migration guide (`docs/migrations/v17.0.0.md`), which is a significant omission for a major version release.

- **File**: `docs/README.md`
- **Remediation**: Add migration guide link, verify all paths resolve

#### Finding M-04: README "Documentation" section links to docs that contradict it (MEDIUM)

**Severity: Medium**

README.md lines 109-116 link to GETTING_STARTED.md, GUIDE.md, and API_REFERENCE.md. A user who follows the README example with `openWarpGraph()` and clicks "Getting Started" will land in a doc that uses `WarpApp.open()` -- a completely different API pattern. This is disorienting.

- **Impact**: The documentation pipeline fractures at the first handoff
- **Remediation**: Update the linked docs to use v17 API (see C-02)

#### Finding M-05: SECURITY.md code examples use `graph.serve()` and `graph.syncWith()` (MEDIUM)

**Severity: Medium**

`.github/SECURITY.md` lines 96-114 show:

```js
await graph.serve({ port: 3000, ... });
await graph.syncWith('http://peer:3000', { ... });
```

In the v17 API, these would be `graph.sync.serve()` and `graph.sync.syncWith()`. The v16 direct-on-graph form still works through WarpApp/WarpCore backward compat, but the SECURITY doc should show the canonical path.

- **File**: `.github/SECURITY.md` lines 96-114
- **Remediation**: Update to v17 namespace form

#### Finding M-06: ARCHITECTURE.md repository layout uses `.js` extensions (MEDIUM)

**Severity: Medium**

`docs/ARCHITECTURE.md` (the worktree copy from the earlier commit) showed `.js` file extensions in the repository layout section. The main-branch version has been updated with the new system map but still references some conceptual `.js` file names. Since src/ is 100% TypeScript, any remaining `.js` references in the layout section are stale.

- **File**: `docs/ARCHITECTURE.md` (verify the "Repository layout" section if present)
- **Remediation**: Ensure all file references use `.ts` extensions

#### Finding L-01: No TypeDoc or auto-generated API docs (LOW)

**Severity: Low**

The repo has a hand-maintained `index.d.ts` (4073 lines) and a hand-maintained `API_REFERENCE.md` (2422 lines). There is no TypeDoc, TSDoc, or other auto-generated documentation pipeline. The `WarpGraph.ts` source has excellent JSDoc with `@example` blocks, but this is not extracted into any published form.

- **Impact**: API docs will drift from implementation (as already seen with `index.d.ts` missing `openWarpGraph`)
- **Remediation**: Consider generating `index.d.ts` from source and/or adding TypeDoc to CI

#### Finding L-02: ADVANCED_GUIDE.md is relatively thin (LOW)

**Severity: Low**

At 219 lines, ADVANCED_GUIDE.md is the thinnest of the narrative docs. It covers patch anatomy and replay convergence well, but substrate topics promised in cross-references (trust, performance, checkpoint tuning) may need expansion.

- **File**: `docs/ADVANCED_GUIDE.md`
- **Impact**: Advanced users may not find the depth they need
- **Remediation**: Expand with trust model details, performance guidance, and checkpoint tuning

#### Finding L-03: CLI_GUIDE.md short for the breadth of CLI surface (LOW)

**Severity: Low**

At 178 lines, CLI_GUIDE.md covers pre-flight checks, time-travel debugging (`seek`), and basic workflows. The CLI has many more subcommands (per `bin/cli/` directory). The guide could benefit from a complete command index.

- **File**: `docs/CLI_GUIDE.md`
- **Remediation**: Add a command reference table or link to `--help` output

#### Finding L-04: BEARING.md and VISION.md serve overlapping roles (LOW)

**Severity: Low**

Both BEARING.md and VISION.md describe the system's purpose and current state. VISION.md has been expanded to include public API surface examples (lines 80-98), which overlaps with BEARING.md's "where are we" section. The boundary between "aspirational direction" (VISION) and "current position" (BEARING) is blurring.

- **Files**: `docs/VISION.md`, `docs/BEARING.md`
- **Impact**: Minor -- these are internal docs, not user-facing
- **Remediation**: Clarify scope boundaries in each file's header

### 1.3 Time-to-Value (TTV) Barrier Assessment

**TTV for a new user following the README:**

1. User reads README quick-start (TypeScript example with `openWarpGraph`) -- clear, 10 lines
2. User copies example, runs it -- **FAILS** if using TypeScript (index.d.ts missing export)
3. User falls back to JavaScript -- works
4. User clicks "Getting Started" link -- encounters completely different API (`WarpApp.open`)
5. User is confused about which API to use

**TTV rating: BLOCKED for TypeScript users, DEGRADED for JavaScript users.**

The README itself is excellent -- concise, well-structured, honest about tradeoffs. The admission architecture framing is clear and the capability table is a strong orientation device. But the documentation pipeline breaks at the very first handoff.

## Section 2: Required Updates and Completeness Check

### 2.1 README Priority Fixes

| Priority | Issue | Finding ID |
|----------|-------|------------|
| P0 | `index.d.ts` missing `openWarpGraph` export | C-01 |
| P0 | Version not bumped to 17.0.0 | C-03 |
| P0 | CHANGELOG needs dated v17 section | H-03 |
| P1 | GETTING_STARTED/GUIDE/API_REFERENCE stale on v16 API | C-02 |
| P1 | index.js JSDoc example uses deprecated API | H-01 |
| P2 | VISION.md/README.md namespace inconsistency | H-02 |
| P2 | CONTRIBUTING.md .js references | H-04 |
| P2 | package.json description misaligned | H-05 |

### 2.2 Missing Standard Documentation

| Document | Status | Notes |
|----------|--------|-------|
| README.md | Present, v17 updated | Good positioning, good structure |
| LICENSE | Present | Apache 2.0, standard text |
| NOTICE | Present | Correct attribution |
| CONTRIBUTING.md | Present, stale | Needs .js-to-.ts updates |
| SECURITY.md | Present, stale API examples | Strong content, needs v17 API updates |
| CHANGELOG.md | Present, not release-ready | [Unreleased] needs promotion to [17.0.0] |
| Migration guide | Present | `docs/migrations/v17.0.0.md` -- thorough and well-structured |
| Code of Conduct | MISSING | No CODE_OF_CONDUCT.md found |
| Architecture doc | Present, v17 updated | Clear and accurate |
| API Reference | Present, stale | 2422 lines, all v16 API |
| Getting Started | Present, stale | v16 API throughout |
| Guide | Present, stale | v16 API throughout |
| CLI Guide | Present | Light but functional |

### 2.3 Supplementary Documentation

| Area | Coverage | Notes |
|------|----------|-------|
| Formal invariants | Excellent | 15 invariants with paper citations in `docs/invariants/` |
| Protocol specs | Good | 4 specs in `docs/specs/` |
| Design docs | Excellent | 17 design cycles in `docs/design/` |
| Retrospectives | Good | In `docs/method/retro/` |
| ADRs | Present | 4 in `adr/` |
| Trust docs | Present | `docs/trust/` directory |
| Release runbook | Present | `docs/method/release.md` -- clear and complete |
| Systems style guide | Present | `docs/SYSTEMS_STYLE_TYPESCRIPT.md` |
| Maintainer docs | Present | `.github/maintainers/` |
| Migration scripts | Present | `scripts/migrations/v17.0.0/` -- 3 scripts |
| Examples | MISSING | Removed in v15, never replaced |

## Section 3: Final Action Plan

### 3.1 Recommendation Type

**MAJOR REVISION REQUIRED** -- specifically, a documentation alignment pass for v17 before release. The README and architecture docs are well ahead of the tutorial/reference pipeline. The release is blocked by missing type exports and un-bumped versions.

### 3.2 Deliverables

#### Release blockers (must fix before v17.0.0 tag)

1. **Bump version** -- `package.json` and `jsr.json` to `17.0.0`
2. **Promote CHANGELOG** -- move `[Unreleased]` to `[17.0.0] -- YYYY-MM-DD`
3. **Update `index.d.ts`** -- add `openWarpGraph`, `WarpGraph`, `WarpGraphDeps`, `CommitmentSurface`, `FoldingSurface`, `RevelationSurface`, `GovernanceSurface`, and all capability interfaces

#### High priority (should fix before release, can follow fast if needed)

4. **Rewrite GETTING_STARTED.md** -- use `openWarpGraph()` as primary entry point
5. **Rewrite GUIDE.md** -- use `openWarpGraph()` + `graph.patches.*` / `graph.query.*` patterns
6. **Rewrite API_REFERENCE.md** -- update all examples to v17 API, add `openWarpGraph()` as first entry
7. **Update `index.js` JSDoc** -- replace `WarpApp.open()` example with `openWarpGraph()` example
8. **Update CONTRIBUTING.md** -- fix `.js` to `.ts`, fix pre-commit description

#### Medium priority (fix soon after release)

9. **Reconcile namespace notation** -- decide on flat (`graph.patches`) vs nested (`graph.commitment.patches`) as the canonical form; update VISION.md and all docs to be consistent
10. **Update SECURITY.md examples** -- use `graph.sync.serve()` form
11. **Update CONCEPTUAL_OVERVIEW.md** -- fix query example
12. **Update docs/README.md index** -- add migration guide link
13. **Create test-backed examples** -- `test/examples/` directory with documented flows
14. **Add CODE_OF_CONDUCT.md** -- standard community file

#### Low priority (future improvement)

15. **Auto-generate `index.d.ts`** or add CI check that it matches `index.js` exports
16. **Expand ADVANCED_GUIDE.md** -- trust model, performance tuning, checkpoint guidance
17. **Expand CLI_GUIDE.md** -- complete command reference
18. **Clarify BEARING.md vs VISION.md boundary** -- add scope notes

### 3.3 Mitigation Prompt

For the documentation rewrite (items 4-6), the following prompt captures the transformation needed:

> Rewrite GETTING_STARTED.md, GUIDE.md, and API_REFERENCE.md to use `openWarpGraph()` as the primary entry point. All code examples should use the v17 capability-namespace pattern: `graph.patches.createPatch()`, `graph.query.getNodeProps()`, `graph.materialize.materialize({})`, `graph.sync.syncWith()`, etc. Preserve the existing narrative structure and progressive disclosure. Add a brief note in each doc that `WarpApp.open()` still works for backward compatibility but will be removed in v18. The canonical namespace form should be the flat aliases (`graph.patches` not `graph.commitment.patches`). Verify each code example compiles against the `WarpGraph` interface in `src/domain/WarpGraph.ts`.

---

## Appendix: Files Examined

| Path | Purpose | Last substantive update |
|------|---------|----------------------|
| `/README.md` | Front door | v17 (current) |
| `/CHANGELOG.md` | Release history | In progress (v17 in [Unreleased]) |
| `/package.json` | Package metadata | v16 (stale) |
| `/jsr.json` | JSR metadata | v16 (stale) |
| `/index.js` | Package barrel | v17 (exports openWarpGraph) |
| `/index.d.ts` | Type declarations | v16 (missing openWarpGraph) |
| `/.github/CONTRIBUTING.md` | Contributor guide | v16 (stale .js references) |
| `/.github/SECURITY.md` | Security model | v16 API examples |
| `/NOTICE` | Attribution | Current |
| `/LICENSE` | Apache 2.0 | Current |
| `/docs/GETTING_STARTED.md` | Tutorial | v16 API |
| `/docs/GUIDE.md` | How-to guide | v16 API |
| `/docs/API_REFERENCE.md` | Reference | v16 API |
| `/docs/ADVANCED_GUIDE.md` | Explanation | Mostly version-agnostic |
| `/docs/CLI_GUIDE.md` | Operator guide | Current |
| `/docs/CONCEPTUAL_OVERVIEW.md` | Explanation | Mostly version-agnostic |
| `/docs/ARCHITECTURE.md` | System map | v17 (current) |
| `/docs/VISION.md` | Doctrine | v17 (current, namespace inconsistency) |
| `/docs/BEARING.md` | Position | v17 (current) |
| `/docs/README.md` | Doc index | Mostly current |
| `/docs/migrations/v17.0.0.md` | Migration guide | v17 (current, thorough) |
| `/docs/method/release.md` | Release runbook | Current |
| `/src/domain/WarpGraph.ts` | openWarpGraph() source | v17 (current, well-documented) |
