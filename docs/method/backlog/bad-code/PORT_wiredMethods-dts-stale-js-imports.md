---
id: PORT_wiredMethods-dts-stale-js-imports
blocked_by: []
blocks: []
feature: api-capabilities
release_home: v17.0.0
---

# _wiredMethods.d.ts still imports stale `.js` paths

`src/domain/warp/_wiredMethods.d.ts` still references deleted `.js` siblings
such as `../services/QueryBuilder.js` and `../services/Observer.js`.

That means the blocked compatibility artifact is not just large and
hand-maintained; it is also carrying stale path assumptions from before the
repo-wide TS migration. Any consumer-surface or declaration-surface work that
tries to surface `_wiredMethods.d.ts` more directly will trip over those stale
imports immediately.

This should be fixed as part of the runtime/capability cleanup path, not by
pretending the file can stay hand-maintained forever.
