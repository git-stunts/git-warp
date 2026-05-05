# 0138 Sync Production Auth Defaults Retro

- Date: 2026-05-05
- Cycle: `0138-sync-production-auth-defaults`
- Source task: `HEX_sync-production-auth-defaults`
- Commit: this cycle closeout commit

## What Happened

The HTTP sync server no longer defaults open. `HttpSyncServer` now
rejects non-local bind hosts unless auth is configured with
`mode: "enforce"` and `SyncSecret` keys. Local unauthenticated serving
still exists, but callers must set
`unsafeAllowUnauthenticatedLocalhost: true`.

The guard lives in the server option parser, so public `graph.sync.serve`
and direct internal server construction share the same defaults.

## What Went Well

- The REDs were precise: four config-boundary tests failed for the
  missing unsafe option and open non-local auth posture.
- Existing local no-auth fixtures were easy to classify and mark as
  explicit unsafe-local development.
- Full unit validation stayed green after the default flip.

## What Was Messy

- Some tests still called the old no-auth path as "backward compat"; the
  new contract needed those names corrected.
- The Zod refinement started too complex and had to be split into named
  validation helpers.
- Docs needed to separate unsafe localhost examples from production
  sync examples.

## SSJS Scorecard

- Runtime-backed forms for new concepts: pass; no new domain concept.
- Boundary validation stays at boundaries: pass; server options validate
  admission defaults before listening.
- Behavior lives on the owning type/module: pass; `HttpSyncServer`
  owns HTTP sync admission defaults.
- No message parsing for behaviorally significant branching: pass.
- No ambient time or entropy in domain code: pass.
- No fake shape trust or cast-cosplay: pass for new production code.

## Next

Pull `HEX_sync-no-rate-limiting`. Production sync auth identity is now
stable enough to add per-key request throttling without bundling 500
response sanitization into the same diff.
