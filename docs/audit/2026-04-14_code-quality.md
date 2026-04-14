---
report_id: "AUD-2026-04-14-CQ01"
title: "Code Quality Audit: @git-stunts/git-warp v17.0.0"
status: "Final"
audit:
  date_started: 2026-04-14
  date_completed: 2026-04-14
  type: "Full"
  scope: "src/, test/, bin/"
  compliance_frameworks: ["SSTS (Systems-Style TypeScript)"]
target:
  repository: "github.com/git-stunts/git-warp"
  branch: "release/v17.0.0"
  commit_hash: "f17df0cd"
  language_stack: ["TypeScript 5.9", "Node.js 22+"]
  environment: "Development"
methodology:
  automated_tools: ["ESLint 9", "TypeScript Compiler (strict)", "Vitest Coverage"]
  manual_review_hours: 0
  false_positive_rate: "N/A"
summary:
  total_findings: 18
  severity_count:
    critical: 1
    high: 4
    medium: 8
    low: 5
  remediation_status: "Pending"
related_reports:
  previous_audit: "N/A"
  tracking_ticket: "N/A"
---

# Code Quality Audit: @git-stunts/git-warp v17.0.0

## Section 0: Executive Report Card

| Metric | Score | Grade | Rationale |
|--------|-------|-------|-----------|
| **DX Score** (Developer Experience) | 78/100 | B+ | Excellent API surface design (openWarpGraph capability bag), strong README with quick start, comprehensive error hierarchy. Docked for documentation gaps in advanced workflows and stale JSDoc example in index.js. |
| **IQ Score** (Internal Quality) | 71/100 | B | 97.71% line coverage, 100% TypeScript, well-enforced hexagonal architecture, mature ESLint ruleset. Docked for the WarpRuntime god object (773 LOC + 708 LOC shadow), 69 `as unknown as` casts in src/, and Subscriber type using bare `Function`. |
| **Overall Recommendation** | **Ship with caveats** | | v17.0.0 is production-ready for the use cases it targets. The admission architecture is sound, the CRDT invariants are well-tested, and the public API is clean. However, the WarpRuntime/wiredMethods wiring layer is the single greatest risk to long-term maintainability. The recommended strategic fix is a WarpRuntime decomposition that eliminates the cast-cosplay between controllers and the capability surface. |

---

## Section 1: DX: Ergonomics & Interface Clarity

### 1.1 Time-to-Value (TTV)

**Score: 8/10**

The quick start in `README.md` is concise and accurate. A consumer can go from `npm install` to a working graph in roughly 12 lines of code:

```typescript
const graph = await openWarpGraph({ persistence, graphName: 'events', writerId: 'agent-1' });
const patch = await graph.patches.createPatch();
patch.addNode('user:alice').setProperty('user:alice', 'role', 'admin');
await patch.commit();
await graph.materialize.materialize({});
const props = await graph.query.getNodeProps('user:alice');
```

**Strengths:**
- Single entry point (`openWarpGraph`) with sensible defaults for all optional ports.
- Capability bag organized by architectural moment (commitment/folding/revelation/governance) with flat aliases for ergonomic access.
- Auto-construction of blob storage, codec, crypto, and index store when not explicitly provided.

**Weaknesses:**
- The `index.js` module-level JSDoc example (lines 14-32) still uses the legacy `WarpApp.open()` API rather than `openWarpGraph()`, which is the v17 entry point. A new consumer following this example would use the deprecated path.
- The `materialize.materialize({})` call requires an empty options object. A no-arg overload would reduce friction.

**Action Prompt:**
Update the `index.js` module-level JSDoc to use `openWarpGraph()`. Add a no-arg overload or default parameter to `MaterializeCapability.materialize()` so `graph.materialize.materialize()` works without `{}`.

### 1.2 Principle of Least Astonishment (POLA)

**Score: 7/10**

**Strengths:**
- The frozen capability bag prevents accidental mutation of the API surface.
- Error types are domain-specific (`PatchError`, `SyncError`, `QueryError`) with structured `code` fields, never raw `Error`.
- ESLint enforces determinism in domain code: `Date.now()`, `Math.random()`, `setTimeout` are all banned.

**Weaknesses:**
- `openWarpGraph()` exposes `_runtime` (prefixed with underscore) on the public WarpGraph interface (line 119 of `WarpGraph.ts`). This leaks the internal WarpRuntime to consumers, violating encapsulation. A consumer who discovers this field can bypass all capability boundaries.
- The `Subscriber` type in `WarpRuntime.ts` (lines 88-91) uses bare `Function` for `onChange` and `onError`. This is the only use of `Function` in src/. It defeats type checking on subscriber callbacks.
- The legacy `WarpApp` and `WarpCore` are still exported as the default export from `index.js` (`export default WarpApp`), while the README promotes `openWarpGraph()`. A consumer using `import WarpApp from '@git-stunts/git-warp'` gets the deprecated API with no compile-time warning.

**Action Prompt:**
1. Replace `_runtime` on `WarpGraph` with a `Symbol`-keyed property or a `WeakMap` so it is not discoverable via dot completion.
2. Type `Subscriber.onChange` and `Subscriber.onError` with concrete function signatures instead of `Function`.
3. Add a `@deprecated` JSDoc annotation to the `WarpApp` default export in `index.js` and add a `console.warn` in `WarpApp.open()` for v17 to guide migration.

### 1.3 Error Usability

**Score: 8/10**

**Strengths:**
- All errors extend `WarpError` with structured `code` and `context` fields.
- 27 domain error classes cover every failure category (audit, cache, CRDT, crypto, encryption, fork, index, message codec, patch, persistence, query, shard, storage, strand, sync, traversal, trust, wormhole, writer).
- ESLint `no-restricted-syntax` enforces "no raw Error / TypeError" in all source files, with a separate block for domain files that also bans `Date.now()` etc.
- `Error.captureStackTrace` is called when available for clean stack traces.

**Weaknesses:**
- Error codes are string constants scattered across throw sites (e.g., `'E_INVALID_ARG'`, `'E_CHECKPOINT_POLICY_TYPE'`). There is no central registry or enum-like constant file for all error codes, making it difficult for consumers to programmatically match on error codes.
- Some error codes are duplicated or inconsistent in naming convention (e.g., `E_PATCH_NO_STATE` vs `E_AUTO_MATERIALIZE_TYPE` vs `E_ON_DELETE_WITH_DATA_INVALID`).

**Action Prompt:**
Create a `src/domain/errors/ErrorCodes.ts` module exporting named string constants for all error codes. Reference these constants at throw sites and in `index.d.ts` so consumers can import and match on them.

---

## Section 2: DX: Documentation & Extendability

### 2.1 Documentation Gap

**Score: 7/10**

**Strengths:**
- `README.md` is well-structured with quick start, concept table, architecture moments, and usage guidance.
- `docs/ARCHITECTURE.md` provides a clear system map and architectural principles.
- `docs/SYSTEMS_STYLE_TYPESCRIPT.md` is a thorough 100+ line engineering doctrine.
- `docs/GUIDE.md` and `docs/GETTING_STARTED.md` exist for onboarding.
- `CHANGELOG.md` is detailed and well-maintained.
- `index.d.ts` is 4,073 lines with full type signatures.

**Weaknesses:**
- No documentation for advanced multi-writer workflows: conflict analysis, strand-based speculative execution, and braid composition are powerful features with zero user-facing docs outside the type signatures.
- The capability interfaces (`QueryCapability`, `PatchCapability`, etc.) use abstract classes with underscore-prefixed parameter names and no inline docs on individual methods. A consumer reading `PatchCapability` gets method signatures but no behavioral contract.
- The `browser.js` / `browser.d.ts` export paths are undocumented. The browser story (what works, what does not, which adapters to use) is not explained.

**Action Prompt:**
1. Add a `docs/ADVANCED.md` covering strands, braids, conflict analysis, and observers with worked examples.
2. Add JSDoc descriptions to all methods on the 9 capability abstract classes.
3. Document the browser export path and its limitations in `README.md`.

### 2.2 Customization Score

**Score: 8/10**

**Strengths:**
- 21 port abstractions provide comprehensive extension points: `GraphPersistencePort`, `BlobStoragePort`, `CryptoPort`, `CodecPort`, `ClockPort`, `LoggerPort`, `SeekCachePort`, `EffectSinkPort`, `PatchJournalPort`, `CheckpointStorePort`, `IndexStorePort`, `HttpServerPort`, etc.
- Multiple runtime adapters ship out of the box: `GitGraphAdapter`, `InMemoryGraphAdapter`, `NodeCryptoAdapter`, `WebCryptoAdapter`, `BunHttpAdapter`, `DenoHttpAdapter`.
- The `EffectPipeline` + `ExternalizationPolicy` system allows rich event-driven extensions.
- Trust modes (`off` / `log-only` / `enforce`) and GC policies are fully configurable.

**Weaknesses:**
- Port abstractions are classes (`abstract class`), not interfaces. While this aligns with SSTS doctrine, it means consumers implementing custom adapters must extend the class rather than implement an interface. This makes testing with plain object mocks impossible without `as unknown as`.
- The `GraphPersistencePort` is a "composite port" (per its own JSDoc) implementing 5 focused ports. Domain services accept the composite even when they only need one focused port, which increases coupling for adapter authors.

**Action Prompt:**
Consider adding `satisfies` or a validation function that lets consumers verify a plain object implements a port contract without class inheritance. This preserves SSTS while reducing friction for adapter authors. (Note: this is a design discussion, not a blocker.)

---

## Section 3: Internal Quality: Architecture & Maintainability

### 3.1 Debt Hotspot — WarpRuntime God Object

**Severity: HIGH**

`WarpRuntime.ts` (773 LOC) + `_wiredMethods.d.ts` (708 LOC) + `runtimeWiring.ts` (265 LOC) = **1,746 LOC** of tightly coupled wiring that forms the backbone of the system.

**Evidence:**
- `WarpRuntime.ts` declares 62 instance fields (lines 152-212), each prefixed with `_`, spanning state cache, controllers, ports, policies, and degradation flags.
- `runtimeWiring.ts` uses `Object.defineProperty` to wire 60+ methods onto `WarpRuntime.prototype` at runtime, defeating TypeScript's ability to verify the class contract statically. The `_wiredMethods.d.ts` file exists solely to tell tsc about methods that do not exist in the class body.
- The constructor (lines 220-331) requires an `eslint-disable` for `max-lines-per-function` and `complexity`. The static `open()` factory (lines 433-618) requires the same.
- 12 `as unknown as` casts exist within `WarpRuntime.ts` alone. The `temporal` getter (lines 652-675) casts `this` to ad-hoc inline types to call wired methods that the class body does not declare.

**Impact:**
This is the system's gravitational center. Every controller, capability, and test fixture passes through WarpRuntime. The runtime wiring pattern means bugs in method delegation are invisible to the compiler — they surface only at runtime. The `_wiredMethods.d.ts` shadow file must be manually kept in sync with `runtimeWiring.ts`; any drift produces silent type lies.

**Action Prompt:**
Execute the planned `API_kill-warpruntime` cycle. Decompose WarpRuntime into a thin composition root that delegates to controller instances without prototype patching. Each controller should directly implement its capability interface. The openWarpGraph factory should wire controllers to capabilities without `as unknown as` casts. Target: zero `.d.ts` augmentation files, zero `Object.defineProperty` delegation.

### 3.2 Abstraction Violation — Cast Cosplay in openWarpGraph

**Severity: HIGH**

`WarpGraph.ts` lines 215-223:

```typescript
const query = runtime as unknown as QueryCapability;
const patches = runtime as unknown as PatchCapability;
const materialize = runtime as unknown as MaterializeCapability;
// ... 6 more casts
```

This is the composition root — the single most important trust boundary in the system. It casts a single `WarpRuntime` instance to 9 different capability interfaces using `as unknown as`, which SSTS explicitly bans ("No `as` assertions. Type assertions bypass the compiler."). The compiler cannot verify that WarpRuntime actually implements any of these capability contracts. The only evidence is the prototype-patched methods from `runtimeWiring.ts`.

**Total `as unknown as` usage across src/:** 69 occurrences in 33 files. While some are at legitimate boundaries (infrastructure adapters, parser outputs), the majority are workarounds for the WarpRuntime wiring pattern.

**Action Prompt:**
Same as 3.1 — the WarpRuntime decomposition eliminates these casts. As an interim measure, add a runtime assertion in `openWarpGraph()` that verifies the runtime object has all expected methods before casting, similar to `requireCapabilities.ts` which already validates adapter ports.

### 3.3 Testability Barrier — Large Integration-Style Test Files

**Severity: MEDIUM**

Several test files significantly exceed the 800 LOC guideline:

| File | LOC |
|------|-----|
| `StrandService.test.ts` | 2,840 |
| `WarpGraph.test.ts` | 2,198 |
| `ConflictAnalyzerService.test.ts` | 2,016 |
| `WarpGraph.strands.test.ts` | 1,432 |
| `JoinReducer.integration.test.ts` | 1,423 |
| `CommitDagTraversalService.test.ts` | 1,413 |
| `PatchBuilder.test.ts` | 1,353 |
| `CheckpointService.test.ts` | 1,295 |

**Impact:**
Oversized test files are harder to navigate, slower to run in isolation (vitest filters by file, not by describe block), and tend to accumulate implicit dependencies between test cases. The 2,840-line `StrandService.test.ts` is testing a service that was dissolved — the test file outlived its subject.

**Action Prompt:**
Split test files over 1,000 LOC along describe-block boundaries. For `StrandService.test.ts`, verify all tests are still exercising live code (not the deleted `StrandService.js`) and migrate them to test the `StrandCoordinator` and individual strand services directly.

### 3.4 Node.js Type Leak in Port Contracts

**Severity: MEDIUM**

`src/ports/GraphPersistencePort.ts` and `src/ports/CommitPort.ts` both import:

```typescript
import type { Readable } from 'node:stream';
```

This violates the hexagonal architecture principle: port contracts should be runtime-agnostic. A browser or Deno consumer implementing `CommitPort` must depend on `node:stream` types even if their adapter never uses Node streams. The `logNodesStream` method returns `Promise<Readable>`, coupling the port contract to a Node-specific type.

**Action Prompt:**
Replace `Readable` with `AsyncIterable<string>` or a custom `ReadableStreamLike` type that does not require `node:stream`. This aligns with the codebase's existing use of `AsyncIterable<Uint8Array>` for content streams in `QueryCapability`.

### 3.5 ESLint Complexity Relaxation Sprawl

**Severity: MEDIUM**

The `eslint.config.js` contains **109 files** in relaxed-complexity override blocks (lines 270-441). These files are allowed `complexity: 35`, `max-lines-per-function: 200`, `max-depth: 6`, and `max-params: 10` — a 7x increase from the base `complexity: 5` and `max-lines-per-function: 30`.

This is roughly 30% of all source files operating under relaxed rules. The relaxation was inherited from the JavaScript era and expanded during the TypeScript migration. While individual exemptions are justified (JoinReducer, index builders), the sheer volume suggests the base limits are aspirational rather than enforced.

**Action Prompt:**
Audit the relaxed-complexity file list. For each file, determine whether the relaxation is still needed post-migration. Files that were split (StrandService, SyncProtocol, CheckpointService) may still be listed under their old names. Remove stale entries. For files that legitimately need relaxation, add inline comments explaining why.

### 3.6 Ambient Default Utilities in Domain

**Severity: LOW**

`src/domain/utils/defaultCrypto.ts` imports `node:crypto` at module load time:

```typescript
import type { Hash, Hmac } from 'node:crypto';
// ...
const nodeCrypto = await import('node:crypto');
```

While the dynamic import has a try/catch fallback, the `import type` at the top creates a compile-time dependency on `node:crypto` within the domain layer. Similarly, `defaultCodec.ts` wraps `cbor-x`. These "default" utilities exist in `src/domain/utils/` but they are infrastructure in disguise.

**Action Prompt:**
Move `defaultCrypto.ts`, `defaultCodec.ts`, and `defaultClock.ts` to `src/infrastructure/defaults/`. They provide concrete implementations of ports, which is the infrastructure layer's job.

---

## Section 4: Internal Quality: Risk & Efficiency

### 4.1 Critical Flaw — Vite Dev Dependency Vulnerability

**Severity: CRITICAL (dev dependency)**

`npm audit` reports 1 high-severity vulnerability in `vite` (8.0.0-8.0.4):
- **GHSA-4w7w-66w2-5vf9**: Path traversal in optimized deps `.map` handling
- **GHSA-v2wj-q39q-566r**: `server.fs.deny` bypassed with queries
- **GHSA-p9ff-h696-f583**: Arbitrary file read via Vite dev server WebSocket

While vite is a dev dependency (used transitively by vitest), this is still a risk for contributors running the dev server. The fix is available via `npm audit fix`.

**Action Prompt:**
Run `npm audit fix` to update vite. If the update breaks vitest compatibility, pin vitest to a version that pulls a patched vite.

### 4.2 Efficiency Sink — Prototype Wiring Overhead

**Severity: LOW**

`runtimeWiring.ts` uses `Object.defineProperty` in a loop to attach 60+ methods to `WarpRuntime.prototype`. Each delegated method creates a closure that accesses the controller via `this[controllerField]` and calls the method with `fn.call(ctrl, ...args)`.

This means every public API call (e.g., `graph.query.getNodeProps('alice')`) goes through:
1. Property access on the frozen WarpGraph object
2. `as unknown as` cast (compile-time only, no runtime cost)
3. Property access on WarpRuntime.prototype (defineProperty'd function)
4. Dynamic controller field lookup via string key
5. Non-null assertion on the controller
6. Dynamic method lookup via string key
7. Non-null assertion on the method
8. `fn.call(ctrl, ...args)` delegation

The extra indirection is measurable at scale (thousands of ops/sec) though unlikely to be a bottleneck in practice given that most operations involve Git I/O.

**Action Prompt:**
When WarpRuntime is decomposed, ensure controllers are wired directly as capability implementations. This eliminates steps 3-8 entirely.

### 4.3 Dependency Health

**Severity: MEDIUM**

| Dependency | Version | Status | Notes |
|-----------|---------|--------|-------|
| `roaring` | ^2.7.0 | Active | C++ addon; cross-platform build risk |
| `roaring-wasm` | ^1.1.0 | Active | WASM fallback for roaring |
| `cbor-x` | ^1.6.0 | Active | Fast CBOR codec; no known issues |
| `zod` | 3.24.1 | Pinned exact | Active; pinning prevents minor updates |
| `elkjs` | ^0.11.0 | Active | Graph layout for visualization |
| `boxen` | ^7.1.1 | Active | CLI formatting |
| `chalk` | ^5.3.0 | Active | CLI colors; ESM-only |
| `cli-table3` | ^0.6.3 | Active | CLI tables |
| `figures` | ^6.0.1 | Active | CLI symbols |
| `@git-stunts/alfred` | ^0.4.0 | Internal | Retry/timeout utilities |
| `@git-stunts/git-cas` | ^5.3.2 | Internal | Content-addressable storage |
| `@git-stunts/plumbing` | ^2.8.0 | Internal | Git plumbing operations |
| `@git-stunts/trailer-codec` | ^2.1.1 | Internal | Commit trailer encoding |

**Concerns:**
1. **`roaring` native addon**: Requires a C++ toolchain to install. This is a friction point for new contributors and a CI pain point across platforms. The `roaring-wasm` fallback mitigates this, but the dual-dependency pattern adds complexity.
2. **`zod` pinned to exact version** (3.24.1): This prevents automatic minor/patch updates. If intentional (for wire format stability), document the rationale. If not, use `^3.24.1`.
3. **`tar` override** to 7.5.11 in `package.json` overrides section: This suggests a transitive vulnerability was patched manually. Verify the override is still needed.
4. **`patch-package`** in devDependencies: Active patches exist. These should be audited to ensure they are still needed and upstreamed if possible.

**Action Prompt:**
1. Verify the `tar` override is still needed; remove if the underlying dependency has been updated.
2. Document the `zod` pin rationale or switch to `^3.24.1`.
3. Check for upstreamable `patch-package` patches.

### 4.4 Test Coverage

**Severity: LOW**

The coverage ratchet is set at **97.71% line coverage** — an excellent threshold for an infrastructure library. The ratchet auto-updates only via `npm run test:coverage`, preventing ad-hoc runs from lowering the bar.

**Strengths:**
- 378 test files covering 374 source files (1.01:1 ratio).
- Property-based testing with `fast-check` for critical CRDT paths.
- Critical multi-writer regression suite (`WarpGraph.noCoordination.test.ts`).
- Golden fixture tests for wire format stability.
- Hex tripwire tests enforcing architectural boundaries.

**Weaknesses:**
- 29 test helper files remain as `.js` (benchmarks, bats helpers, integration setup). While functional, they are not covered by `tsconfig.test.json` type checking.
- Test file count (387 TS + 29 JS = 416) exceeds source file count (374). This is healthy for a library but the JS helpers should be migrated.

**Action Prompt:**
Convert the 29 remaining JS test helper files to TypeScript as part of the v17.1 cycle.

### 4.5 `_wiredMethods.d.ts` Shadow Type File

**Severity: HIGH**

The 708-line `_wiredMethods.d.ts` is a hand-maintained type declaration that tells TypeScript about 60+ methods that exist only via runtime `Object.defineProperty` wiring. It contains:

- 30+ interface definitions duplicating types from across the codebase (e.g., `WarpStatus`, `SyncRequest`, `ConflictTrace`)
- Method signatures for methods that are actually implemented in 10 different controller classes
- No automated verification that the signatures match the actual controller implementations

This is the single largest type-safety risk in the codebase. If a controller method signature changes and this file is not updated, TypeScript will happily compile code that will fail at runtime. It is, in SSTS terms, "a type annotation without runtime backing" — exactly what Rule 0 warns against.

**Action Prompt:**
Same as 3.1/3.2 — the WarpRuntime decomposition eliminates this file entirely. As an interim measure, add a type-level test that asserts `WarpRuntime` (with wired methods) satisfies all 9 capability interfaces. This would catch signature drift.

### 4.6 `index.js` Export Surface Size

**Severity: LOW**

`index.js` is 337 lines and exports 89 named symbols plus a default export. It includes:
- 7 inline factory functions for v1 op types (lines 85-97) that exist solely for backward compatibility
- Imports from both `.ts` and `.js` files mixed freely
- Symbols from every layer (domain, infrastructure, ports, utils)

This is a large export surface for a library. Consumers who tree-shake will be fine, but those who do not will pull in visualization (elkjs), CLI formatting (boxen, chalk), and roaring bitmaps even if they only need the core graph API.

**Action Prompt:**
Consider organizing exports into sub-paths:
- `@git-stunts/git-warp` — core API only (openWarpGraph, error types, port contracts)
- `@git-stunts/git-warp/adapters` — infrastructure adapters
- `@git-stunts/git-warp/legacy` — WarpApp, WarpCore, v1 factories

This would reduce the default bundle size and provide a cleaner import story.

---

## Section 5: Strategic Synthesis & Action Plan

### 5.1 Combined Health Score

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| TTV | 8/10 | 10% | 0.80 |
| POLA | 7/10 | 15% | 1.05 |
| Error Usability | 8/10 | 10% | 0.80 |
| Documentation | 7/10 | 10% | 0.70 |
| Customization | 8/10 | 10% | 0.80 |
| Debt Hotspot | 4/10 | 15% | 0.60 |
| Abstraction Violation | 3/10 | 10% | 0.30 |
| Testability | 6/10 | 5% | 0.30 |
| Critical Flaw | 7/10 | 5% | 0.35 |
| Efficiency | 8/10 | 5% | 0.40 |
| Dependency Health | 7/10 | 5% | 0.35 |

**Combined Health Score: 74.5/100 (B)**

The score reflects a codebase with an excellent public API surface and strong engineering discipline, held back by a single structural debt hotspot (WarpRuntime + wired methods) that accounts for most of the architecture and abstraction penalty.

### 5.2 Strategic Fix — WarpRuntime Decomposition

**Priority: P1 (next major cycle)**

The single highest-leverage change is decomposing WarpRuntime so that:

1. Each controller class directly implements its corresponding capability interface (`QueryController implements QueryCapability`, etc.).
2. `openWarpGraph()` wires controller instances into the capability bag without casts.
3. `_wiredMethods.d.ts` is deleted.
4. `runtimeWiring.ts` is deleted.
5. `WarpRuntime.ts` becomes a thin composition root (~200 LOC) that constructs controllers with their dependencies.

**Expected impact:**
- Eliminates ~50 of the 69 `as unknown as` casts in src/.
- Eliminates the 708-line shadow type file.
- Reduces the 773-line class to ~200 LOC.
- Makes method signatures compiler-verified for the first time.
- Unlocks independent testing of controllers without the full WarpRuntime.

**Risk:**
This is a large refactor touching the system's core. Mitigate by:
- Writing capability conformance tests first (assert controller implements interface).
- Refactoring one controller at a time behind a feature flag.
- Running the full test suite + no-coordination regression after each controller.

### 5.3 Prioritized Remediation Plan

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P0 | 4.1 Vite vulnerability | 5 min | Eliminates dev-dependency CVE |
| P1 | 3.1 + 3.2 + 4.5 WarpRuntime decomposition | 2-3 cycles | Eliminates god object, casts, shadow types |
| P1 | 3.4 Node.js type leak in ports | 1 day | Fixes hexagonal violation in port contracts |
| P2 | 1.2 Remove `_runtime` from WarpGraph | 1 hour | Closes encapsulation leak |
| P2 | 1.2 Type `Subscriber` callbacks | 30 min | Fixes bare `Function` usage |
| P2 | 1.1 Update index.js JSDoc | 30 min | Fixes stale documentation |
| P2 | 1.3 Error code registry | 1 day | Improves consumer error handling |
| P2 | 3.3 Split oversized test files | 2 days | Improves test navigability |
| P3 | 2.1 Advanced workflow docs | 3 days | Unblocks power users |
| P3 | 3.5 Clean up ESLint relaxation list | 1 day | Reduces technical debt |
| P3 | 3.6 Move default utils to infrastructure | 1 day | Fixes architectural layering |
| P3 | 4.3 Dependency hygiene | 1 day | Audit tar override, zod pin, patches |
| P3 | 4.4 Convert JS test helpers | 1 day | Completes TypeScript migration |
| P3 | 4.6 Sub-path exports | 2 days | Reduces default bundle size |

---

## Appendix A: Files Examined

| File | LOC | Notes |
|------|-----|-------|
| `src/domain/WarpRuntime.ts` | 773 | God object; 62 fields, 12 casts |
| `src/domain/warp/_wiredMethods.d.ts` | 708 | Shadow type file for wired methods |
| `src/domain/WarpGraph.ts` | 244 | Composition root; 9 casts |
| `src/domain/runtimeWiring.ts` | 265 | Prototype patching; 60+ methods |
| `src/domain/runtimeHelpers.ts` | 150 | Factory helpers |
| `index.js` | 337 | 89 named exports + default |
| `index.d.ts` | 4,073 | Hand-maintained type declarations |
| `eslint.config.js` | 689 | 109 files in relaxed overrides |
| `vitest.config.js` | 36 | 97.71% coverage ratchet |
| `package.json` | 163 | 14 deps, 15 devDeps |

## Appendix B: Methodology

This audit was performed through manual code review of the release/v17.0.0 branch at commit f17df0cd. The review covered:

1. **Public API surface**: `openWarpGraph()`, capability interfaces, `index.js` exports, `index.d.ts` type declarations.
2. **Architecture**: Hexagonal layering (domain/ports/infrastructure), dependency direction, Node.js type leaks.
3. **SSTS compliance**: `as unknown as` usage, `Function` types, `any`/`unknown` escapes, runtime-backed types.
4. **Code metrics**: File sizes vs 500 LOC limit, ESLint relaxation coverage, test file sizes.
5. **Dependency health**: `npm audit`, version pinning, native addon risk.
6. **Test infrastructure**: Coverage ratchet, test helpers, regression suites, JS remnants.
7. **Error handling**: Custom error hierarchy, structured codes, ESLint enforcement.
