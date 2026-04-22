---
id: DX_dependency-hygiene-audit
blocked_by: []
blocks: []
---

# Audit dependency hygiene: tar override, zod pin, patch-package

**Audit ref:** CQ01-4.3

Three dependency concerns flagged:

1. **`tar` override** to 7.5.11 in `package.json` overrides — suggests a
   transitive vulnerability was patched manually. Verify the override is
   still needed; remove if the underlying dep has been updated.

2. **`zod` pinned to exact** 3.24.1 — prevents automatic minor/patch
   updates. If intentional (wire format stability), document the
   rationale. If not, switch to `^3.24.1`.

3. **`patch-package`** in devDeps — active patches exist. Audit whether
   they are still needed and upstream if possible.

## Steps

1. Check if `tar` override is still required.
2. Document or un-pin zod.
3. List and evaluate all `patches/` entries.
