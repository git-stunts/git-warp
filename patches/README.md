# Patches

This directory contains local modifications to dependencies, managed by [`patch-package`](https://github.com/ds300/patch-package).

## Rationale

### `@git-stunts/trailer-codec@2.1.1`

- **Issue:** The package ships JavaScript without bundled TypeScript
  declarations.
- **Impact:** git-warp would otherwise need ambient declarations in its own
  source tree, making dependency runtime drift harder to notice.
- **Why Patch?** Keeping declarations beside the dependency gives the
  TypeScript compiler a package-local contract while preserving the runtime
  dependency.
- **Status:** Required until upstream publishes equivalent package
  declarations.

### `@git-stunts/plumbing@3.3.1`

- **Issue:** A reused mktree process may exit after external GC repacks its
  object database. A raw broken-pipe error bypasses CAS's bounded protocol
  recovery, making checkpoint/GC attachment reads fail depending on timing.
- **Fix:** Classify `EPIPE` and typed closed-session input at the mktree write
  boundary as `GitProtocolError`. CAS invalidates the session and retries once
  with a fresh process. Producer errors, unrelated failures, and reference
  publication are unchanged.
- **Evidence:** Deterministic single/batch transport fault injection, retry
  exhaustion and error preservation, plus real attachment checkpoint/GC tests.
- **Tracking:** [git-warp #923](https://github.com/git-stunts/git-warp/issues/923).
  Remove this patch when the locked upstream dependency includes the repair.
