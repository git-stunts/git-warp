---
id: DX_pre-push-hook-split-typecheck
---

# Pre-push hook should use the split typecheck

The pre-push hook runs `npm run typecheck` which now runs both
`tsconfig.src.json` (strict) and `tsconfig.test.json` (relaxed).
Verify the hook is actually running both passes. If it only runs
the old single `tsc --noEmit`, test tsc errors won't be caught.
