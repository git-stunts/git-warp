---
id: MODEL_remove-nonexistent-entity-silent
blocked_by: []
blocks: []
feature: trie-state-storage
---

# removeNode/removeEdge on a non-existent entity silently produces no-op

**Effort:** S

## Issue

If you call `removeNode('X')` and X was never added to the graph
(state exists but X isn't in it), `orsetGetDots` returns empty,
producing a `NodeRemove` with `observedDots: []`. The patch commits
successfully but the remove has no effect. This is different from the
null-state bug (fixed with `E_PATCH_NO_STATE`) — here state EXISTS
but the entity doesn't. The PatchBuilderV2 tests bless this as
correct behavior. Should at minimum warn.

## Fix

Check if `orsetGetDots` returns empty for a non-null state. If so,
either throw `PatchError('E_PATCH_ENTITY_NOT_FOUND')` or emit a
warning via logger. The user asked to remove something that doesn't
exist — that's either an error or should be explicitly acknowledged.
