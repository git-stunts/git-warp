---
report_id: "AUD-2026-04-14-SR01"
title: "Ship Readiness Audit: @git-stunts/git-warp v17.0.0"
status: "Final"
audit:
  date_started: 2026-04-14
  date_completed: 2026-04-14
  type: "Full"
  scope: "Full repository — src/, test/, bin/, docs/, config"
  compliance_frameworks: ["Release Runbook (docs/method/release.md)"]
target:
  repository: "github.com/git-stunts/git-warp"
  branch: "release/v17.0.0"
  commit_hash: "f17df0cd"
  language_stack: ["TypeScript 5.9", "Node.js 22+"]
  environment: "Pre-Release"
methodology:
  automated_tools: ["ESLint 9", "TypeScript Compiler", "Vitest", "npm audit"]
  manual_review_hours: 0
  false_positive_rate: "N/A"
summary:
  total_findings: 14
  severity_count:
    critical: 1
    high: 2
    medium: 5
    low: 6
  remediation_status: "Pending"
related_reports:
  previous_audit: "N/A"
  tracking_ticket: "N/A"
---

# Ship Readiness Audit: @git-stunts/git-warp v17.0.0

## Executive Summary

The `@git-stunts/git-warp` repository on branch `release/v17.0.0` is in strong shape for release. All four automated gates (lint, typecheck-src, typecheck-test, unit tests) pass cleanly. The codebase is 100% TypeScript in `src/` with zero `.js` files remaining. 6,332 tests pass across 356 files.

**Ship recommendation: YES, BUT** — one critical blocker (version not bumped to 17.0.0) and two high-severity items (coverage regression, missing community files) must be resolved before tagging. Estimated remediation: under 1 hour.

---

## Gate Results

| Gate | Status | Detail |
|------|--------|--------|
| ESLint | PASS | Zero errors, zero warnings |
| TypeScript (src) | PASS | `tsconfig.src.json` clean |
| TypeScript (test) | PASS | `tsconfig.test.json` clean |
| Unit tests | PASS | 356 files, 6,332 tests, 18.98s |
| npm audit | WARN | 1 high-severity devDep (vite 8.0.0-8.0.4) |
| npm pack --dry-run | PASS | 429 files, 624.7 kB packed |
| Coverage ratchet | FAIL | 95.43% lines vs 97.71% threshold |

---

## Section 1: Quality & Maintainability Assessment

### 1.1 Tech Debt Score

**Score: 3.2 / 5** (Moderate — manageable debt, no blockers for ship)

| Category | Assessment |
|----------|------------|
| Source LOC | 53,075 across 374 `.ts` files |
| Test LOC | 109,384 across 378 `.ts` files |
| Test:Source ratio | 2.06:1 (healthy) |
| LOC violations (source >500) | 2 files: `WarpRuntime.ts` (773), `_wiredMethods.d.ts` (708) |
| LOC violations (test >800) | 29 files (largest: `StrandService.test.ts` at 2,840) |
| `as unknown` casts | 80 across src/ (concentrated in infrastructure adapters and `WarpRuntime.ts`) |
| TODO/FIXME in src/ | 5 items (all tracked with context; none are blockers) |
| Bad-code backlog items | 121 files in `docs/method/backlog/bad-code/` |
| Deprecated exports | 3 (`PatchV2`, `PatchBuilderV2`, `CommitDagTraversalService` traversal facade) |
| `defaultCodec` in domain | 0 direct imports (hex boundary clean); codec injected via ports |

Positive signals:
- Zero `any` in domain code
- Zero `Buffer` usage in domain (only `Uint8Array`)
- Zero `eval`, `new Function`, or `child_process` in src/
- Zero prototype pollution vectors (`__proto__` never referenced)
- Input validation via `adapterValidation.ts` with ref injection prevention
- Trust chain validation via Zod schemas (`src/domain/trust/schemas.ts`)
- Hexagonal architecture enforced: `HookInstaller` uses injected `FsAdapter`/`PathUtils` ports
- All 374 source files are TypeScript; zero `.js` remains in `src/`

### 1.2 Readability & Consistency

#### Issue 1: `WarpRuntime.ts` exceeds 500 LOC limit (773 LOC)

**File**: `src/domain/WarpRuntime.ts`
**Lines**: 773 (limit: 500)

The class carries a constructor with `eslint-disable max-lines-per-function, complexity` and 30+ injected dependencies. While the 11 controller extractions (NO_DOGS_NO_MASTERS campaign) significantly reduced the god class, the core file still exceeds the project's own 500-LOC ceiling.

**Mitigation prompt**:
> Split WarpRuntime constructor into a `WarpRuntimeBuilder` or factory that constructs the dependency graph in stages. The static `open()` method already does half of this — extract the remaining constructor body into the factory. Target: WarpRuntime.ts under 400 LOC. Track as `API_kill-warpruntime` (already in backlog).

#### Issue 2: `_wiredMethods.d.ts` at 708 LOC — ambient declaration file with no tests

**File**: `src/domain/warp/_wiredMethods.d.ts`
**Lines**: 708

This ambient `.d.ts` file declares the entire WarpRuntime mixed-in method surface. It exists to give TypeScript visibility into dynamically wired prototype methods. It has no runtime code and therefore no test coverage, but it is the source of truth for the runtime's public contract.

**Mitigation prompt**:
> As controllers stabilize, generate `_wiredMethods.d.ts` from the capability interface types (QueryCapability, PatchCapability, etc.) rather than maintaining it by hand. This eliminates the risk of declaration drift. Can be deferred to v17.1 since `openWarpGraph()` is the new entry point and sidesteps `_wiredMethods.d.ts` entirely.

#### Issue 3: 29 test files exceed 800 LOC limit

**Files**: `test/unit/domain/services/strand/StrandService.test.ts` (2,840 LOC), `test/unit/domain/WarpGraph.test.ts` (2,198 LOC), and 27 others.

Large test files slow comprehension but are not ship-blocking. The test-to-source ratio is healthy and all tests pass.

**Mitigation prompt**:
> Post-release, split the top 10 oversized test files into logical groups (happy path, edge cases, error paths). Use Vitest's `describe` blocks as natural split points. Target: no test file over 1,200 LOC.

### 1.3 Code Quality Violations

#### Violation 1: Ambient wall clock in domain services (4 call sites)

**Files**:
- `src/domain/services/provenance/btrOperations.ts:90` — `new Date().toISOString()`
- `src/domain/services/audit/AuditVerifierService.ts:94` — `new Date().toISOString()`
- `src/domain/services/audit/AuditReceiptService.ts:365` — `Date.now()`
- `src/domain/services/sync/SyncAuthService.ts:68` — `Date.now()`

The project doctrine states: "Wall clock is banned from `src/domain/`. Time must enter through a port or parameter." These 4 call sites violate that rule.

**Rewrite** (example for `SyncAuthService.ts:68`):
```ts
// Before:
const timestamp = String(Date.now());

// After — inject ClockPort:
const timestamp = String(this._clock.now());
```

**Mitigation prompt**:
> Replace all 4 `Date.now()` / `new Date()` calls in domain with `ClockPort.now()` injection. btrOperations already accepts an `opts.timestamp` fallback — remove the `?? new Date().toISOString()` default and make it required or clock-injected. SyncAuthService should receive a ClockPort in its constructor. AuditVerifierService and AuditReceiptService likewise.

#### Violation 2: `openWarpGraph()` casts runtime to capability interfaces via `as unknown as`

**File**: `src/domain/WarpGraph.ts:215-223`

```ts
const query = runtime as unknown as QueryCapability;
const patches = runtime as unknown as PatchCapability;
// ... 7 more
```

This bypasses TypeScript's structural type checking. If a capability method is renamed or its signature changes on `WarpRuntime`, the cast silently succeeds and the error surfaces only at runtime.

**Rewrite**:
```ts
// Use a runtime assertion helper (already exists: requireCapabilities)
const query = requireCapabilities<QueryCapability>(runtime, 'QueryCapability', [
  'getNodeProps', 'getEdgeProps', 'queryBuilder', /* ... */
]);
```

**Mitigation prompt**:
> Replace the 9 `as unknown as` casts in `openWarpGraph()` with `requireCapabilities()` calls that verify method presence at runtime. This was already done for adapter boot in `WarpRuntime.open()` — apply the same pattern here. Alternatively, make WarpRuntime implement the capability interfaces explicitly (requires v18 API_kill-warpruntime work).

#### Violation 3: Consumer type surface test does not cover `openWarpGraph`

**File**: `test/type-check/consumer.ts`

The consumer compile-check exercises `WarpApp`, `WarpCore`, and dozens of domain types, but does not import or exercise `openWarpGraph` or `WarpGraph` — the new v17 public entry point. This means the `.d.ts` surface for the flagship API is not validated by the type-level smoke test.

**Rewrite**:
```ts
// Add to consumer.ts:
import { openWarpGraph, type WarpGraph } from '@git-stunts/git-warp';

declare const graph: WarpGraph;
graph.patches;       // PatchCapability
graph.query;         // QueryCapability
graph.commitment;    // CommitmentSurface
graph.folding;       // FoldingSurface
graph.revelation;    // RevelationSurface
graph.governance;    // GovernanceSurface
```

**Mitigation prompt**:
> Add `openWarpGraph` and `WarpGraph` interface assertions to `test/type-check/consumer.ts`. Verify that all 9 capability namespaces and 4 architectural moment surfaces are present. This is a pre-release requirement — the new public API must be covered by the type surface test before v17.0.0 ships.

---

## Section 2: Production Readiness & Risk Assessment

### 2.1 Top 3 Ship-Stopping Risks

#### Risk 1 (CRITICAL): Version not bumped — package.json and jsr.json both read `16.0.0`

**Evidence**: `node -e "require('./package.json').version"` returns `16.0.0`. `jsr.json` also reads `16.0.0`.

The release runbook (step 1) requires bumping both files to `17.0.0` and adding a dated CHANGELOG entry. The CHANGELOG currently has everything under `[Unreleased]` with no `[17.0.0] — 2026-04-14` header. The preflight script (`scripts/release-preflight.sh`) will hard-fail on both checks.

**Impact**: Release pipeline will reject the tag. npm and JSR will publish as 16.0.0 if somehow tagged, which is a version collision with the existing published release.

**Mitigation prompt**:
> 1. Bump `version` in both `package.json` and `jsr.json` to `17.0.0`.
> 2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [17.0.0] — 2026-04-14` and add a fresh `## [Unreleased]` section above it.
> 3. Run `npm run release:preflight` to verify all 9 checks pass.

#### Risk 2 (HIGH): Coverage ratchet regression — 95.43% vs 97.71% threshold

**Evidence**: `npm run test:coverage` exits with:
```text
ERROR: Coverage for lines (95.43%) does not meet global threshold (97.71%)
```

Line coverage dropped from the ratcheted 97.71% to 95.43%. This is a 2.28 percentage point regression. The preflight script runs `npm run test:local` (not `test:coverage`), so this would not block tagging but **will** block CI on the release tag if coverage is checked there.

**Impact**: If CI enforces coverage thresholds, the release pipeline will fail after tagging. Even if CI does not enforce it, shipping with a known coverage regression signals untested code paths in new v17 surface area.

**Mitigation prompt**:
> Run `npm run test:coverage` with the V8 provider to identify which files dropped. The likely culprits are newly added TypeScript files from the migration that were previously covered as `.js` but lost coverage attribution during the rename. Add targeted tests for uncovered branches. Do NOT lower the ratchet — bring coverage back above 97.71%.

#### Risk 3 (HIGH): Missing `SECURITY.md` and `CONTRIBUTING.md`

**Evidence**: `ls SECURITY.md CONTRIBUTING.md` returns "No such file or directory" for both.

The project's scaffolding rules (CLAUDE.md) require `SECURITY.md`, `CONTRIBUTING.md`, and other community files for open-source repos. These are also GitHub community health signals that affect the project's public profile.

**Impact**: No coordinated vulnerability disclosure process. No contributor onboarding path. GitHub community health score penalized.

**Mitigation prompt**:
> Create `SECURITY.md` with a responsible disclosure policy pointing to a security contact (email or GitHub Security Advisories). Create `CONTRIBUTING.md` with development setup instructions, test commands, and PR guidelines. Both should reference the Apache 2.0 license.

### 2.2 Security Posture

#### Vulnerability 1 (MEDIUM): vite 8.0.0-8.0.4 — 3 high-severity advisories (devDep only)

**Evidence**: `npm audit` reports:
- GHSA-4w7w-66w2-5vf9 — Path traversal in optimized deps `.map` handling
- GHSA-v2wj-q39q-566r — `server.fs.deny` bypass with queries
- GHSA-p9ff-h696-f583 — Arbitrary file read via WebSocket

All three affect the Vite dev server. Vite is a `devDependency` used only by Vitest for test running. It is not shipped in the npm package (`npm pack --dry-run` confirms 429 files, none from `node_modules/vite`).

**Impact**: No production impact. Development machines running `npm run test:local` are theoretically exposed if an attacker can reach the Vite dev server (unlikely in CI/local-only contexts). Low practical risk.

**Mitigation prompt**:
> Run `npm audit fix` to upgrade vite to a patched version. If a breaking change prevents automatic fix, pin to the next patched vite release in `package.json` overrides. This is non-blocking for release but should be resolved before the next development cycle begins.

#### Vulnerability 2 (MEDIUM): Sync auth secrets passed as plain strings in domain types

**Evidence**:
- `src/domain/capabilities/SyncCapability.ts:54` — `auth?: { secret: string; keyId?: string }`
- `src/domain/services/sync/SyncAuthService.ts:62` — `secret: string` parameter
- `src/domain/services/controllers/syncHelpers.ts:135` — `auth.secret` accessed

HMAC secrets for sync authentication are passed as plain `string` values through multiple domain layers. While the sync feature requires secrets at runtime, the plain string type provides no protection against accidental logging, serialization, or inclusion in error messages.

**Impact**: If a logger or error handler serializes the auth config object, the HMAC secret could appear in logs. The risk is mitigated by the project's `no-console: "error"` ESLint rule and typed error classes, but the defense is not structural.

**Mitigation prompt**:
> Wrap sync auth secrets in an opaque `SyncSecret` class that overrides `toString()`, `toJSON()`, and `[Symbol.for('nodejs.util.inspect.custom')]` to return `'[REDACTED]'`. The HMAC computation path extracts the raw bytes via a private accessor. This prevents accidental exposure in logs, JSON serialization, and Node inspect output.

### 2.3 Operational Gaps

#### Gap 1 (MEDIUM): No `openWarpGraph` in `index.d.ts` — type surface incomplete

`openWarpGraph` is exported from `index.js` (line 246) and the runtime module, but `grep -n "openWarpGraph\|WarpGraph" index.d.ts` returns no matches. TypeScript consumers using the package will not see the new v17 entry point in their IDE or get type checking for it.

The hand-maintained `index.d.ts` (4,073 LOC) does not yet include the `WarpGraph` interface or `openWarpGraph` function signature.

**Remediation**: Add `WarpGraph`, `WarpGraphDeps`, `CommitmentSurface`, `FoldingSurface`, `RevelationSurface`, `GovernanceSurface`, and `openWarpGraph` declarations to `index.d.ts`. Run `npm run typecheck:surface` to validate agreement.

#### Gap 2 (MEDIUM): `_runtime` property exposed on `WarpGraph` interface

**File**: `src/domain/WarpGraph.ts:118-119`

```text
/** The underlying runtime — TEMPORARY bridge. Removed when API_kill-warpruntime ships. */
readonly _runtime: WarpRuntime;
```

The frozen capability bag exposes its internal runtime as a public property prefixed with `_`. While documented as temporary, this creates a de facto public API escape hatch that consumers will depend on. Once published in v17.0.0, removing it in v18 becomes a breaking change.

**Remediation**: Either (a) omit `_runtime` from the `WarpGraph` interface and type it only on the concrete implementation, or (b) accept the cost and plan the breaking removal in v18 CHANGELOG now. If keeping it, add a `@deprecated` JSDoc tag and `@internal` marker.

#### Gap 3 (LOW): No runtime integration tests against real Git repositories

The test suite runs 6,332 unit tests using `InMemoryGraphAdapter`. There are no integration tests that exercise the full path through `GitGraphAdapter` to a real Git repository. The BATS CLI tests (mentioned in CI) partially cover this, but they test the CLI layer, not the SDK.

**Remediation**: Post-release, add a small integration test suite (10-20 tests) that opens a real temporary Git repo, writes patches, materializes, and verifies Git objects exist. This validates the adapter layer end-to-end.

---

## Section 3: Final Recommendations

### 3.1 Ship Recommendation

**YES, BUT** — ship after resolving the 3 items below. All are achievable in under 1 hour of focused work.

### 3.2 Prioritized Action Plan

#### Action 1 (CRITICAL — must fix before tagging)

**Version bump and CHANGELOG dating**

1. Set `version` to `17.0.0` in both `package.json` and `jsr.json`.
2. Rename `## [Unreleased]` to `## [17.0.0] — 2026-04-14` in `CHANGELOG.md`.
3. Add fresh `## [Unreleased]` section above it.
4. Add `openWarpGraph`, `WarpGraph`, and associated types to `index.d.ts`.
5. Add `openWarpGraph` coverage to `test/type-check/consumer.ts`.
6. Run `npm run release:preflight` — all 9 checks must pass.

#### Action 2 (HIGH — should fix before tagging)

**Coverage ratchet recovery**

1. Run `npm run test:coverage` and identify files below threshold.
2. Add targeted tests for uncovered branches (likely in newly converted `.ts` files).
3. Verify `npm run test:coverage` passes with the 97.71% ratchet.

#### Action 3 (MEDIUM — fix before or immediately after tagging)

**Community files and security hygiene**

1. Create `SECURITY.md` with responsible disclosure policy.
2. Create `CONTRIBUTING.md` with dev setup, test commands, PR guidelines.
3. Run `npm audit fix` to resolve the vite advisory.
4. Audit the 4 ambient `Date.now()` / `new Date()` calls in domain and file tickets.

---

## Appendix A: File Inventory

| Metric | Count |
|--------|-------|
| Source files (src/) | 374 `.ts` files |
| Test files (test/) | 378 `.ts` files |
| Source LOC | 53,075 |
| Test LOC | 109,384 |
| Source files >500 LOC | 2 (`WarpRuntime.ts`, `_wiredMethods.d.ts`) |
| Test files >800 LOC | 29 |
| `as unknown` casts in src/ | 80 |
| TODO/FIXME in src/ | 5 |
| Bad-code backlog items | 121 |
| Deprecated exports | 3 |
| npm package size (packed) | 624.7 kB |
| npm package files | 429 |

## Appendix B: Automated Gate Detail

```text
ESLint:          0 errors, 0 warnings
tsc (src):       0 errors
tsc (test):      0 errors
Vitest:          356 files, 6,332 tests, 0 failures (18.98s)
npm audit:       1 high (devDep: vite)
npm pack:        429 files, 624.7 kB
Coverage:        95.43% lines (threshold: 97.71%) — FAIL
```

## Appendix C: TODO/FIXME Inventory

| File | Line | Content | Blocking? |
|------|------|---------|-----------|
| `src/domain/capabilities/DetachedGraphFactory.ts` | 1 | `TODO: Return type will change from WarpRuntime to WarpGraph` | No — tracked for v18 |
| `src/domain/capabilities/SyncCapability.ts` | 93 | `TODO: remote parameter will change from WarpRuntime to WarpGraph` | No — tracked for v18 |
| `src/domain/WarpRuntime.ts` | 218 | `TODO(OG): split constructor responsibilities` | No — tracked as API_kill-warpruntime |
| `src/domain/WarpRuntime.ts` | 431 | `TODO(OG): split open() validation/bootstrapping` | No — tracked as API_kill-warpruntime |
| `src/domain/WarpGraph.ts` | 118 | `TEMPORARY bridge. Removed when API_kill-warpruntime ships.` | No — documented |
