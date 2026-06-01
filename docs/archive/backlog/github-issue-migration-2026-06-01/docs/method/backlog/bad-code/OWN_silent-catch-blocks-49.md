---
id: OWN_silent-catch-blocks-49
blocked_by: []
blocks: []
feature: docs-dx
release_home: v17.0.0
---

# 49 silent catch blocks across the codebase

**Effort:** M

49 `catch {}` or `catch { /* empty */ }` blocks. Most are
intentional (lazy-loading fallbacks in defaultCrypto, roaring.js,
etc.) but indistinguishable from accidental error swallowing.

Worst offender: `GitGraphAdapter.ping()` silently catches ALL
errors including permission errors and corrupted repository states,
reducing them to `{ ok: false, latencyMs: 0 }`.

## What's wrong

- Can't distinguish intentional from accidental error swallowing
- Health check hides actionable error details
- Debugging production issues harder when errors are silenced

## Suggested fix

Audit all 49 blocks. Add inline comments explaining expected errors.
For health-check paths, return error details instead of boolean.
For fallbacks, add a comment: `// Expected: module not available`.
