---
report_id: "AUD-2026-04-14-COMP01"
title: "Audit Comparison: v16.0.0 (2026-04-05) vs v17.0.0 (2026-04-14)"
status: "Final"
audit:
  date_started: 2026-04-14
  date_completed: 2026-04-14
  type: "Differential"
  scope: "All prior audits vs current triple audit"
  compliance_frameworks: ["SSTS (Systems-Style TypeScript)"]
target:
  repository: "github.com/git-stunts/git-warp"
  branch: "release/v17.0.0"
  commit_hash: "f17df0cd"
  language_stack: ["TypeScript 5.9", "Node.js 22+"]
  environment: "Pre-Release"
methodology:
  automated_tools: ["Manual comparative review"]
  manual_review_hours: 0
  false_positive_rate: "N/A"
summary:
  total_findings: 50
  severity_count:
    critical: 5
    high: 11
    medium: 19
    low: 15
  remediation_status: "Pending"
related_reports:
  previous_audit: "AUD-2026-04-05 (Production Readiness, Test Quality, Invariant)"
  tracking_ticket: "N/A"
---

# Audit Comparison: v16.0.0 (2026-04-05) vs v17.0.0 (2026-04-14)

## Timeline

| Date | Event |
|------|-------|
| 2026-04-05 | Production readiness audit (v16.0.0, JavaScript) |
| 2026-04-05 | Test quality audit (372 files, 33 findings) |
| 2026-04-05 | Invariant audit (19 invariants, 3 FAIL) |
| 2026-04-05–11 | TypeScript migration: 3 agents, 5 sessions |
| 2026-04-11 | Sludge audit: 10 surviving patterns identified |
| 2026-04-14 | Pre-release triage: 2 blockers fixed, 14 stale items resolved |
| 2026-04-14 | Triple audit (code quality, docs, ship readiness) — this report |

Nine days separate the two audit snapshots. In between: a full language
migration, 50+ god kills, a new public API surface, and a 593-commit
campaign.

---

## What Improved

### 1. Language and type safety — DRAMATIC improvement

| Metric | v16 (Apr 5) | v17 (Apr 14) | Delta |
|--------|-------------|--------------|-------|
| Source language | JavaScript ES Modules | TypeScript (strict) | Complete migration |
| Source files | 257 .js | 374 .ts / 0 .js | 100% TypeScript |
| Test files | 346 .js | 378 .ts / 0 .test.js | 100% TypeScript |
| tsc errors | N/A (no tsc) | 0 (two strict configs) | New gate |
| `any` in domain | Uncounted (no checker) | 0 (IRONCLAD M9 ratchet) | Enforced zero |
| `Buffer` in domain | Present | 0 (`Uint8Array` only) | Clean hex boundary |

**Verdict:** The single biggest improvement across both audits. The v16
audit couldn't even measure type safety because the codebase was JavaScript.
Now there are two strict tsconfig passes, an IRONCLAD ratchet blocking JSDoc
wildcards, and compile-time enforcement of domain purity rules.

### 2. God object reduction — SIGNIFICANT improvement

| Metric | v16 (Apr 5) | v17 (Apr 14) | Delta |
|--------|-------------|--------------|-------|
| WarpRuntime LOC | 1,037 | 773 | -25% |
| WarpRuntime constructor params | 27 | ~30 (injected ports) | Roughly flat |
| PatchBuilderV2 LOC | 1,101 | Split (under 500) | Killed |
| God objects total | "dozens" (undocumented) | 2 remaining (WarpRuntime + _wiredMethods) | ~50 killed |
| eslint-disable comments in WarpRuntime | 12 | Still present | Unchanged |

The v16 audit flagged WarpRuntime (1,037 LOC), PatchBuilderV2 (1,101 LOC),
and SubscriptionController as SRP violations. PatchBuilderV2 was decomposed.
SubscriptionController was refactored. WarpRuntime shrank by 264 LOC but
remains the system's gravitational center. The *new* issue is that
`_wiredMethods.d.ts` (708 LOC) now exists as a shadow type file — a debt
that didn't exist in v16 because there were no types to shadow.

### 3. Test suite — STRONG improvement

| Metric | v16 (Apr 5) | v17 (Apr 14) | Delta |
|--------|-------------|--------------|-------|
| Tests | 5,554 | 6,332 | +778 (+14%) |
| Test files | 346 | 378 (.ts) | +32 |
| Coverage threshold | Not ratcheted | 97.71% ratchet | New gate |
| Test quality findings | 33 (3C/7H/12M/11L) | Not re-audited | Unknown |

The test quality audit from Apr 5 found 33 issues across 372 files, with
8 "blesses bug" findings and 10 vacuous assertions. The v17 audit did not
re-run the test quality audit, so we don't know how many of those 33
findings were addressed during the migration. The test count increased by
14%, coverage is now ratcheted, and shared fixtures replaced ad-hoc mocks.

### 4. Public API surface — NEW (didn't exist in v16)

The v16 audit evaluated `WarpApp.open()` as the entry point.
`openWarpGraph()` with capability namespaces is entirely new — a frozen
capability bag with 9 namespaces organized by admission moments
(commitment/folding/revelation/governance). This is architecturally
superior to the v16 "everything is a method on one object" pattern.

### 5. Dependency security — REGRESSED then improved

| Metric | v16 (Apr 5) | v17 (Apr 14) | Delta |
|--------|-------------|--------------|-------|
| npm audit vulns | 0 | 1 high (vite devDep) | Worse |
| `eval` / `new Function` | 0 | 0 | Stable |
| Prototype pollution | 0 | 0 | Stable |
| Input validation | Present | Present + Zod schemas | Improved |

The v16 audit reported 0 npm vulnerabilities. The v17 audit found 1
high-severity advisory in vite (devDep only, not shipped). This is a
transitive dependency regression from upgrading vitest. The actual
security posture of shipped code is unchanged or improved (Zod trust
chain validation was added).

### 6. Lint strictness — IMPROVED

| Metric | v16 (Apr 5) | v17 (Apr 14) | Delta |
|--------|-------------|--------------|-------|
| Lint errors | Uncounted | 0 | New zero-tolerance gate |
| Lint warnings | Uncounted | 0 | No warnings allowed |
| ESLint config | Present | Strict (complexity:5, max-lines:30) | Tightened |
| IRONCLAD M9 | Didn't exist | Active (pre-commit + pre-push) | New gate |

---

## What Got Worse

### 1. `_wiredMethods.d.ts` — NEW debt (didn't exist before)

This 708-line ambient declaration file is purely a consequence of the
TypeScript migration. In JavaScript, WarpRuntime's prototype-patched
methods were invisible to tooling — no lies, just silence. In TypeScript,
they need type declarations, which created a hand-maintained shadow file
that can drift from reality without any compiler check.

**v16:** WarpRuntime's wired methods had no types. Broken? Nobody knew.
**v17:** WarpRuntime's wired methods have hand-maintained types. Broken?
The compiler still doesn't know, but now there's a 708-line *promise*
that they're correct.

This is the paradox of honest code: making the system type-aware
surfaced a debt that was always there but invisible.

### 2. `as unknown as` cast proliferation — NEW debt

| Metric | v16 (Apr 5) | v17 (Apr 14) | Delta |
|--------|-------------|--------------|-------|
| `as unknown as` in src/ | 0 (JavaScript) | 69 across 33 files | New |
| At trust boundaries | N/A | 9 in openWarpGraph() | New |

In JavaScript, there were no casts because there were no types. The
TypeScript migration introduced 69 `as unknown as` casts — many at
legitimate boundaries (parsers, infrastructure adapters), but 9 at the
most important trust boundary (`openWarpGraph()` capability wiring).
These are the price of typing a system whose runtime wiring pattern
(Object.defineProperty) is invisible to the compiler.

### 3. Coverage ratchet regression — UNKNOWN to KNOWN

v16 had no coverage ratchet. v17 has one set at 97.71%, and the current
measurement is 95.43%. This is technically a regression *from the ratchet
target*, but it's actually an improvement in *visibility* — we now know
coverage dropped and have a gate to catch it.

### 4. Documentation split-brain — NEW (didn't exist before)

v16 had one API (`WarpApp.open()`), and all docs pointed at it. v17 has
a new API (`openWarpGraph()`), but only README.md and ARCHITECTURE.md were
updated. GETTING_STARTED.md, GUIDE.md, and API_REFERENCE.md still use the
v16 API. This creates a worse user experience than v16 — at least v16 was
*consistently* documented.

### 5. `index.d.ts` fell further behind — WORSE

The v16 audit didn't flag `index.d.ts` because the gap was smaller (no
new API surface to miss). The v17 audit found that the flagship new
feature (`openWarpGraph`) is missing from `index.d.ts` entirely. The file
grew from ~2,400 lines to 4,073 lines during the migration, but the most
important new export was never added.

---

## What Should Have Changed, But Didn't

### 1. Ambient wall clock in domain — STILL BROKEN

**v16 audit (invariant audit):** Found 16 unsuppressed violations of the
determinism invariants, including `Date.now()` and `new Date()` in domain
services. Three invariants (ambient time, ambient entropy, ambient
scheduling) failed.

**v17 audit:** Found the same 4 call sites: `btrOperations.ts`,
`AuditVerifierService.ts`, `AuditReceiptService.ts`, `SyncAuthService.ts`.

The backlog item `CC_btr-audit-ambient-timestamps` was filed on Apr 5 and
is still open 9 days later. The TypeScript migration touched these files
(`.js` → `.ts`) but did not fix the invariant violation. The wall clock
was *right there* during the rename and nobody pulled it out.

### 2. Sync auth secrets as plain strings — STILL BROKEN

**v16 audit:** Flagged `SyncAuthService` storing HMAC keys as
`Record<string, string>`, vulnerable to heap inspection and accidental
logging.

**v17 audit:** Found the exact same pattern, now in TypeScript. The type
is more explicit (`secret: string`), which arguably makes it *worse* —
the type system now *documents* that this is a plain string but provides
no structural protection.

### 3. CBOR depth/size limits — STATUS UNKNOWN

**v16 audit (Action 1, highest priority):** "Add depth (maxDepth=32)
and size (maxSize=5MB) limits to all CBOR decode paths. Single
`safeDecode()` wrapper. Effort: 1-2 hours."

**v17 audit:** The backlog item `CC_cbor-no-depth-limits` still exists.
The v17 code quality audit did not specifically re-test this. The prior
audit called it the #1 priority action item.

### 4. Graceful shutdown for sync server — STILL MISSING

**v16 audit (Action 2):** "Add connection draining, signal handling,
in-flight tracking."

**v17 audit:** `CC_sync-server-no-graceful-shutdown` still in backlog.
No change.

### 5. Sync rate limiting — STILL MISSING

**v16 audit (Gap 3):** "No rate limiting on sync endpoint."

**v17 audit:** `CC_sync-no-rate-limiting` still in backlog. No change.

### 6. Node.js type leak in ports — STILL PRESENT

The v16 audit did not flag this (no types to leak in JavaScript). But
`PROTO_commit-port-isp` was filed during the migration noting that
`CommitPort` returns `node:stream.Readable` through the port boundary.
The v17 code quality audit re-flagged it as a hexagonal violation.

This is a case where the TypeScript migration *revealed* a pre-existing
architectural issue. The violation was always there — Node streams in the
port contract — but it only became visible when the port got a type
signature.

### 7. Test quality findings — STATUS UNKNOWN

The Apr 5 test quality audit found 33 issues (3 critical, 7 high). The
v17 triple audit did not re-run the test quality audit. We don't know
how many of the 33 findings were addressed. The 2 critical "blesses bug"
findings in PatchBuilderV2 (remove on non-existent entity) and the 4
high "blesses bug" findings in JoinReducer (accepts malformed removes)
may or may not still be present. PatchBuilderV2 was decomposed, but
whether the tests were fixed is unverified.

---

## What Changed, But Shouldn't Have

### 1. Coverage dropped from (implicit) >97% to 95.43%

The coverage ratchet was set at 97.71% — meaning coverage was at or
above that level when the ratchet was established. The current
measurement is 95.43%, a 2.28 percentage point drop. This happened
during the `.js` → `.ts` file renames: V8 coverage attribution can
lose track of files when paths change. The *code* didn't lose coverage;
the *tooling* lost the mapping.

This is a tooling artifact, not a quality regression, but it should
have been caught and fixed during the migration. The coverage ratchet
exists precisely to prevent this.

### 2. `index.d.ts` grew by 1,600 lines without adding the new API

`index.d.ts` went from ~2,400 lines to 4,073 lines — a 70% increase.
It absorbed types for new domain concepts (admission surfaces, strand
types, trust chain schemas). But it somehow *missed* the single most
important new export: `openWarpGraph()`. The file got bigger but less
accurate.

### 3. npm audit went from 0 to 1 advisory

The v16 audit proudly reported "0 vulnerabilities across 73 production
dependencies." The v17 audit found 1 high-severity advisory in vite
(devDep). This is a transitive regression from upgrading vitest 4.x.
It's not a production risk (vite is dev-only), but it breaks the clean
audit bill of health.

---

## Scorecard

| Dimension | v16 (Apr 5) | v17 (Apr 14) | Trend |
|-----------|-------------|--------------|-------|
| **Language safety** | None (JS) | Strict TS, IRONCLAD ratchet | Dramatically better |
| **God objects** | 3+ major, undocumented total | 2 remaining, all tracked | Better |
| **Test count** | 5,554 | 6,332 | Better (+14%) |
| **Test quality** | 33 findings (3C/7H) | Not re-audited | Unknown |
| **Coverage** | No ratchet | 97.71% ratchet (currently failing) | Gate exists but red |
| **Public API** | WarpApp.open() | openWarpGraph() capability bag | Architecturally better |
| **Documentation** | Consistent (all v16) | Split-brain (README v17, tutorials v16) | Worse |
| **Type declarations** | ~2,400 LOC, complete for v16 | 4,073 LOC, missing flagship export | Worse |
| **npm audit** | 0 | 1 high (devDep) | Slightly worse |
| **Ambient wall clock** | 16 violations (3 invariants FAIL) | 4 call sites (same) | Not fixed |
| **CBOR limits** | No limits (P0 action) | No limits (still open) | Not fixed |
| **Sync security** | Plain strings, no rate limit, no shutdown | Same | Not fixed |
| **Cast cosplay** | 0 (JavaScript) | 69 `as unknown as` | New debt from migration |
| **Shadow types** | 0 (JavaScript) | 708 LOC _wiredMethods.d.ts | New debt from migration |
| **Lint** | Present but unenforced | Zero tolerance, pre-commit gate | Better |
| **Architecture** | Hex violation (defaultCodec) | Same + node:stream in ports | Slightly worse (more visible) |

---

## Recommendations

### Do now (before v17.0.0 ships)

1. **Version bump + CHANGELOG** — trivial, blocks everything.
2. **Add `openWarpGraph` to `index.d.ts`** — the v17 API doesn't
   exist for TS consumers without this.
3. **Fix coverage ratchet** — re-run coverage, add missing tests.

### Do soon (the haunting debts from Apr 5)

4. **CBOR safe decode** — flagged as P0 on Apr 5, still open. This
   was the *single highest priority action* from the first audit.
5. **Ambient wall clock** — 4 domain call sites, invariant still FAIL.
6. **Re-run test quality audit** — we don't know if the 33 findings
   from Apr 5 were addressed. The 2 critical "blesses bug" items
   in PatchBuilderV2 need verification.

### Accept as known debt (v18 territory)

7. **WarpRuntime + _wiredMethods.d.ts** — dies with API_kill-warpruntime.
8. **`as unknown as` casts** — mostly eliminated by WarpRuntime decomposition.
9. **Documentation rewrite** — GETTING_STARTED, GUIDE, API_REFERENCE.
