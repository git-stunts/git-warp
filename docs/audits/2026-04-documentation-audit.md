# Documentation Audit — April 2026

**Date:** 2026-04-05
**Scope:** README.md, CLAUDE.md, METHOD.md, CHANGELOG.md, BEARING.md,
SYSTEMS_STYLE_JAVASCRIPT.md, index.js, supporting docs
**Package version:** 16.0.0

---

## Executive Summary

README.md is clean and accurate. CLAUDE.md has **24 factual
inaccuracies** including 3 critical ones. BEARING.md is stale.
METHOD.md and SYSTEMS_STYLE_JAVASCRIPT.md are accurate. CHANGELOG.md
is well-maintained.

The critical issue: CLAUDE.md is the primary context source for AI
agents working on this repo. It references `WarpGraph.js` which no
longer exists, claims the version is v14.0.0 (it's 16.0.0), lists
5 ports (there are 19), and shows a directory layout that's 2 major
versions behind. Every agent session starts by reading wrong
information.

---

## 1. Accuracy Assessment

### README.md — CLEAN

- No version claims to go stale
- Mermaid diagram matches reality
- Core nouns table accurate
- All documentation links valid
- Minor gap: no "What's New" section (release runbook mandates it)

### CLAUDE.md — 24 INACCURACIES

| # | Severity | Claim | Reality |
|---|----------|-------|---------|
| 1 | CRITICAL | v14.0.0 | 16.0.0 |
| 2 | CRITICAL | `main -- v14.0.0` | main at 16.0.0 |
| 3 | CRITICAL | WarpGraph.js is Main API (~800 LOC) | WarpGraph.js deleted. WarpApp (319) + WarpCore (504) + WarpRuntime (1037) |
| 4 | HIGH | Architecture shows WarpGraph at top | WarpApp -> WarpCore -> WarpRuntime -> Ports |
| 5 | HIGH | 5 ports listed | 19 ports exist |
| 6 | HIGH | ~6 adapters listed | 30 adapter files |
| 7 | HIGH | `examples/` with 11 demos | Directory does not exist |
| 8 | HIGH | Flat services/ directory | 10 subdirectories now |
| 9 | HIGH | 14 of 22 Key Source File paths wrong | Files moved to subdirectories |
| 10 | HIGH | Missing src/domain/stream/ from layout | Major architectural layer (PR #77) |
| 11 | HIGH | Missing controllers/ from layout | NDNM decomposition result |
| 12 | MEDIUM | 226 test files, 4217 cases | 327 files, ~5521 cases |
| 13 | MEDIUM | 56 BATS tests, 10 files | 117 tests, 16 files |
| 14 | MEDIUM | 54 integration tests, 11 files | 188 tests, 14 files |
| 15 | MEDIUM | 7 deps in table | 14 production deps |
| 16 | MEDIUM | Release runbook references README "What's New" | Section doesn't exist |
| 17 | MEDIUM | Missing WarpStream from architecture | Shipped in PR #77 |
| 18 | MEDIUM | Missing controllers from architecture | Shipped in NDNM cycles |
| 19 | MEDIUM | WarpGraph.materialize() in paper mapping | WarpCore.materialize() |
| 20 | LOW | bin/warp-graph.js ~112 LOC | 119 LOC |
| 21 | LOW | 16 command files | 17 + 3 subdirectories |
| 22 | LOW | 18 Deno tests, 7 files | 7 files |
| 23 | LOW | CborCodec under Adapters header | In codecs/ |
| 24 | LOW | Missing command registry from CLI description | registry.js exists |

### BEARING.md — STALE

- Claims cycle 0004 as "last shipped"
- Reality: cycles through 0008+ have shipped
- Strikethroughs acknowledge some but header lags

### METHOD.md — ACCURATE

### SYSTEMS_STYLE_JAVASCRIPT.md — ACCURATE

### CHANGELOG.md — ACCURATE AND WELL-MAINTAINED

---

## 2. Missing Documentation

| Document | Status |
|----------|--------|
| CONTRIBUTING.md | Exists (.github/) |
| SECURITY.md | Exists (.github/) |
| CODE_OF_CONDUCT.md | Exists (.github/) |
| NOTICE | Exists |
| LICENSE | Exists (Apache-2.0) |
| ARCHITECTURE.md | Exists (docs/) |
| API Reference | Exists (docs/) |
| Migration guide (v14->v15->v16) | **MISSING** |
| FAQ | **MISSING** |

### Undocumented Complex Areas

1. WarpStream architecture (no user-facing docs)
2. Effect emission and delivery observations
3. Controller decomposition (9 controllers, none in Architecture doc)
4. Codec-free refactor (3 new ports, undocumented outside CHANGELOG)
5. Trust subsystem not linked from primary docs pipeline

---

## 3. Action Plan

**Recommendation: Incremental (A)**

README is clean. CLAUDE.md needs a factual sweep. BEARING.md needs
a 3-line update. No documents need to be thrown away.

### Priority

1. **URGENT**: Fix CLAUDE.md (24 inaccuracies — agents read it first)
2. **HIGH**: Update BEARING.md
3. **MEDIUM**: Add "What's New" to README or remove runbook mandate
4. **LOW**: Create migration guide, update Architecture doc
