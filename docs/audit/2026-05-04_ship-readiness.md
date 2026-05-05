---
report_id: "AUD-2026-05-04-SR01"
title: "Ship Readiness Audit: git-warp v17 Release Branch"
status: "Final"
audit:
  date_started: 2026-05-04
  date_completed: 2026-05-04
  type: "Full"
  scope: "release/v17.0.0 source, tests, docs, package gates, security posture"
  compliance_frameworks: ["Release Runbook", "Anti-SLUDGE Policy", "Systems-Style TypeScript", "npm audit", "Project METHOD"]
target:
  repository: "github.com/git-stunts/git-warp"
  branch: "release/v17.0.0"
  commit_hash: "2209d3a5"
  language_stack: ["TypeScript 5.9", "Node.js 22+", "Vitest 4.1", "Git CAS"]
  environment: "Pre-Release Local"
methodology:
  automated_tools: ["ESLint", "TypeScript Compiler", "Vitest", "npm audit", "npm outdated", "markdownlint", "ripgrep"]
  manual_review_hours: 5
  false_positive_rate: "Low"
summary:
  total_findings: 14
  severity_count:
    critical: 3
    high: 8
    medium: 3
    low: 0
  remediation_status: "Pending"
related_reports:
  previous_audit: "AUD-2026-04-14-SR01"
  tracking_ticket: "docs/method/backlog/bad-code"
---

# Ship Readiness Audit

## Release Gate Snapshot

| Gate | Status | Evidence |
|------|--------|----------|
| Lint | PASS | `npm run lint` passed. |
| Source/test typecheck | PASS | `npm run typecheck` passed. |
| Consumer typecheck | FAIL | `test/type-check/consumer.ts:318` expects `graphBag.materialize.materialize()`. |
| Unit/local tests | FAIL | `npm run test:local`: 14 failed files, 32 failed tests. |
| Production dependency audit | PASS | `npm audit --omit=dev --audit-level=high`: 0 high vulnerabilities. |
| Docs lint | PASS | `npm run lint:md` passed before report creation. |
| Docs code-sample lint | PASS | `npm run lint:md:code` passed before report creation. |

## 1. Quality and Maintainability Assessment

### 1.1. Technical Debt Score

**Score: 8/10** where 1 is excellent and 10 is unmaintainable.

The three most problematic patterns:

1. **Half-deleted materialization contract.** The public API omits
   materialize, while tests, docs, errors, and internal controllers
   still depend on it. This is release-contract debt, not cosmetic
   cleanup.
2. **RuntimeHost remains a god object.** `src/domain/RuntimeHost.ts`
   is 917 LOC and owns composition, materialization, read cache,
   adjacency, views, subscriptions, provenance, checkpoints, and GC
   state.
3. **Spec sludge in tests.** The test suite still contains
   implementation-text checks and direct private-field/materialization
   assertions. Those tests slow refactors and can bless stale contracts.

### 1.2. Readability and Consistency

**Issue 1:** Public docs teach a removed read path. `README.md:37-38`
and `docs/GETTING_STARTED.md:92-95` tell users to call materialization,
but `WarpGraph` has no public materialize member.

**Mitigation Prompt 1:**

```text
Repair the public read documentation for v17. Add RED docs-code tests that fail on `graph.materialize`, `graph.materialize.materialize`, and `_materializeGraph` in README.md and docs/GETTING_STARTED.md public snippets. Green by rewriting the first write/read examples to use the blessed worldline/optic/reading API exposed by `openWarpGraph()`. Keep the examples short enough to be first-run onboarding examples.
```

**Issue 2:** Runtime error guidance points to materialization instead
of readings. `ProvenanceController.ts:31`, `:37`, `:51`, `:57`, and
`:99` say to call `materialize()`, and `RuntimeHost.ts:468` says
"Call materialize() before querying."

**Mitigation Prompt 2:**

```text
Replace materialization-era read errors with reading-basis errors. Add RED tests for provenance lookups and query cached-state failures that assert errors include the failed operation, the missing reading basis, and a docs link to v17 readings guidance. Green by creating named error-message builders and removing all "Call materialize()" remediation text from read/provenance paths.
```

**Issue 3:** The advanced guide is framed around stale public roots.
`docs/ADVANCED_GUIDE.md:13-23` says `WarpApp` and `WarpCore` are the
two public roots, while current README/API docs prefer `openWarpGraph()`.

**Mitigation Prompt 3:**

```text
Update docs/ADVANCED_GUIDE.md to align with the v17 public root. Add a RED docs consistency test that checks the guide names `openWarpGraph()` as the composition root and does not present `WarpApp`/`WarpCore` as the normal application path. Green by rewriting the "Public roots and boundaries" section around openWarpGraph, capability moments, and substrate/tooling escape hatches.
```

### 1.3. Code Quality Violation

**Violation 1:** `RuntimeHost` owns materialization, cached state,
adjacency, and read freshness.

Original snippet:

```text
async _materializeGraph(options: { ceiling?: number | null } = {}): Promise<MaterializedGraph> {
  if (canUseCachedMaterializedGraph(options, this._stateDirty, this._materializedGraph)) {
    return this._materializedGraph;
  }
  const result = await this._materializeController.materialize({
    ...(options.ceiling !== undefined ? { ceiling: options.ceiling } : {}),
    wantDiff: this._cachedIndexTree !== null,
  });
  await this._onMaterialized(result);
  if (this._materializedGraph !== null) {
    return this._materializedGraph;
  }
  return await this._materializedGraphFromCachedState();
}
```

Simplified rewrite:

```text
class RuntimeReadingBasis {
  constructor(private readonly session: ReadingSession) {}

  async currentWorldline(): Promise<ReadingSnapshot> {
    return await this.session.readCurrentWorldline();
  }

  async pinnedCoordinate(source: CoordinateSource): Promise<ReadingSnapshot> {
    return await this.session.readPinnedCoordinate(source);
  }
}
```

The point is not this exact class name; the ownership boundary is the
fix. RuntimeHost should wire a read-basis owner, not own replay/cache
semantics directly.

**Mitigation Prompt 4:**

```text
Extract RuntimeHost read-cache and materialization ownership into a dedicated RuntimeReadingBasis or RuntimeReadModelOwner. Start with RED characterization tests around current worldline reads, pinned coordinate reads, checkpoint-backed reads, and cache invalidation. Green by moving `_cachedState`, `_stateDirty`, `_materializedGraph`, adjacency construction, and read-basis resolution out of RuntimeHost. RuntimeHost should delegate through explicit methods and remain under the repo source LOC limit.
```

**Violation 2:** `QueryController` depends on a materializable host
instead of a read-basis port.

Original snippet:

```text
type MaterializableHost = QueryReadHost & QueryContentHost & QueryObserverFactoryHost & {
  _materializeGraph(): Promise<MaterializedReadGraph>;
};

async function snapshotCurrent(graph: MaterializableHost): Promise<QuerySnapshot> {
  const materialized = await graph._materializeGraph();
  return { state: cloneState(materialized.state), stateHash: materialized.stateHash };
}
```

Simplified rewrite:

```text
interface QueryReadingPort {
  currentSnapshot(): Promise<QuerySnapshot>;
  liveSnapshot(source: LiveSelector): Promise<QuerySnapshot>;
  coordinateSnapshot(source: CoordinateSelector): Promise<QuerySnapshot>;
  strandSnapshot(source: StrandSelector): Promise<QuerySnapshot>;
}

async function snapshotCurrent(readings: QueryReadingPort): Promise<QuerySnapshot> {
  return await readings.currentSnapshot();
}
```

**Mitigation Prompt 5:**

```text
Refactor QueryController to depend on a QueryReadingPort instead of `_materializeGraph`. Add RED tests with a throwing `_materializeGraph` trap proving current observers, live selectors, coordinate selectors, and strand selectors resolve through the port. Green by moving snapshot resolution behind QueryReadingPort and keeping public query methods behaviorally unchanged.
```

**Violation 3:** `HttpSyncServer` mixes request validation,
authorization, sync execution, and error response shaping. It also
casts parsed input back through `unknown` in domain code.

Original snippet:

```text
const { error, parsed } = parseBody(req.body);
if (error !== null) {
  return error;
}

const authError = await this._authorize(req, parsed as unknown as Record<string, unknown>);
if (authError !== null) {
  return authError;
}

return await this._executeSyncRequest(parsed);
```

Simplified rewrite:

```text
const admission = await this._admission.admit(req);
if (!admission.ok) {
  return admission.response;
}

const outcome = await this._executor.execute(admission.request);
return this._responses.fromExecution(outcome);
```

**Mitigation Prompt 6:**

```text
Split HttpSyncServer into admission, authorization, execution, and response-shaping collaborators. Add RED tests proving parsed SyncRequest values carry a typed frontier-writer view without `as unknown as` in domain code. Green by changing parseBody or validateSyncRequest to return a runtime-backed request object that exposes writer IDs directly, then remove the double assertion from HttpSyncServer.
```

## 2. Production Readiness and Risk Assessment

### 2.1. Top 3 Immediate Ship-Stopping Risks

**Risk 1: Critical - release gates fail.**

Locations:

- `test/type-check/consumer.ts:318`
- `test/unit/domain/*` materialization-related failures
- `test/unit/scripts/uniform-git-cas-closeout.test.ts:75`

`npm run typecheck:consumer` and `npm run test:local` are red. A v17
release cannot ship with failing consumer types or 32 failing tests.

**Mitigation Prompt 7:**

```text
Close all red release gates. Start with `npm run typecheck:consumer` and add/adjust RED tests so the consumer surface proves the v17 API has no public materialize capability. Then work through `npm run test:local` failures by grouping them into materialization deletion, checkpoint schema drift, observer/read behavior, and release-script drift. Green each group with behavior-first tests and production fixes. Finish only when lint, typecheck, consumer typecheck, and test:local all pass.
```

**Risk 2: Critical - `_materializeGraph()` still exists and is called
from read-adjacent runtime paths.**

Locations:

- `src/domain/RuntimeHost.ts:429-442`
- `src/domain/services/controllers/QueryController.ts:57-76`
- `src/domain/services/controllers/SyncController.ts:334-358`
- `src/domain/services/controllers/PatchController.ts:90-94`
- `src/domain/services/controllers/CheckpointController.ts:78`
- `src/domain/services/controllers/SubscriptionController.ts:42`

This directly contradicts the v17 release goal: the public model should
be Optics and Readings over causal worldlines, not graph
materialization.

**Mitigation Prompt 8:**

```text
Delete `_materializeGraph()` completely. Add RED tests that fail if `_materializeGraph` appears in RuntimeHost or controller host contracts, and behavioral tests proving blessed read/query/sync/subscription/checkpoint paths still work through readings. Green by introducing explicit reading-basis services and removing all controller dependencies on `_materializeGraph` and `_materializedGraph`. Do not replace it with a same-behavior differently named whole-graph replay helper.
```

**Risk 3: High - checkpoint schema contract drift.**

Locations:

- `src/domain/services/state/checkpointLoad.ts:60-85`
- `test/unit/domain/services/CheckpointService.edgeCases.test.ts`
- `test/unit/domain/services/CheckpointService.test.ts`

The code documents V5 checkpoint state, but its unsupported-schema
message says schema 2, 3, and 4 are supported. Tests currently disagree
with the implementation about which schema versions should load or
reject.

**Mitigation Prompt 9:**

```text
Resolve checkpoint schema version drift. First write RED tests that encode the intended v17 checkpoint support matrix: supported schema version(s), unsupported legacy versions, error codes, and migration guidance. Green by updating checkpointLoad.ts, CheckpointService tests, and any docs so schema support, error messages, and migration behavior agree. Include fixture coverage for the current v17 schema and for legacy rejection.
```

### 2.2. Security Posture

**Vulnerability 1: High - sync server can run without auth and has no
rate limiting.**

`ServeOptions.auth` is optional at
`src/domain/services/controllers/SyncServerLauncher.ts:22-29`. If auth
is absent, `HttpSyncServer._authorize()` returns `null` at
`src/domain/services/sync/HttpSyncServer.ts:63-69`, allowing the request
to proceed. The default bind host is localhost, but `host` is
configurable at `SyncServerLauncher.ts:52-53`, so an externally bound
server can expose unauthenticated sync unless callers remember to
configure auth. Existing backlog already tracks rate limiting as
`HEX_sync-no-rate-limiting`.

**Mitigation Prompt 10:**

```text
Harden the built-in sync server defaults. Add RED tests proving serve() rejects non-local hosts unless auth mode is enforce with non-empty keys, and proving authenticated requests are rate limited per key ID. Green by requiring explicit `unsafeAllowUnauthenticatedLocalhost` for no-auth local development, enforcing auth for non-local binds, and adding configurable token-bucket limits to SyncAuthService or the HTTP admission layer. Document the secure defaults in the sync guide.
```

**Vulnerability 2: High - HTTP sync errors can leak internal exception
messages.**

`HttpSyncServer._executeSyncRequest()` converts caught exceptions into
HTTP 500 bodies using `err.message` at
`src/domain/services/sync/HttpSyncServer.ts:163-170`. A remote caller
can trigger protocol or persistence failures and receive internal
details that should be logged server-side but not returned over the
wire.

**Mitigation Prompt 11:**

```text
Stop leaking internal sync exception messages to HTTP clients. Add RED tests that force processSyncRequest to throw a detailed internal Error and assert the HTTP response body contains a generic sync failure message plus a stable error code, not the original message. Green by logging the internal message through LoggerPort and returning a sanitized 500 response from HttpSyncServer. Preserve specific 4xx protocol/auth errors that are intentionally client-actionable.
```

### 2.3. Operational Gaps

**Gap 1:** No single release-readiness command or dashboard shows
materialization residue, failing gates, bad-code v17 blockers,
dependency drift, and docs drift together.

**Gap 2:** No bounded-read performance budget is wired into release
checks. The branch needs a budget that proves blessed reads do not
fall back to whole-graph replay.

**Gap 3:** Security operations for sync are incomplete. There is no
documented production profile for auth, rate limits, key rotation,
sanitized errors, and safe bind defaults.

## 3. Final Recommendations and Next Step

### 3.1. Final Ship Recommendation

**NO.**

The current branch should not ship as v17. It fails tests and consumer
type checks, and it does not yet satisfy the stated release contract of
removing materialization from the public/core read model.

### 3.2. Prioritized Action Plan

**Action 1 (High Urgency):** Finish the materialization deletion
closeout. Delete `_materializeGraph()`, replace controller dependencies
with a reading-basis port/service, and update consumer types, tests,
errors, and docs.

**Action 2 (Medium Urgency):** Resolve checkpoint schema drift and
uniform git-cas release-script test drift so the local release gate is
green for real behavior instead of stale string contracts.

**Action 3 (Low Urgency):** Harden sync operational defaults: require
auth for non-local bind hosts, add rate limiting, sanitize HTTP 500
messages, and document the production sync profile.
