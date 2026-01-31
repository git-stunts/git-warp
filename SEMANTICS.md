# EmptyGraph Durability Semantics

This document defines the official durability contract for EmptyGraph.

## Core Durability Contract

**A write is durable if and only if it becomes reachable from the graph ref.**

Unreachable commits may be pruned by Git garbage collection at any time.
EmptyGraph provides mechanisms to ensure writes remain reachable.

## Modes

### Managed Mode (Default)

In managed mode, EmptyGraph guarantees durability for all writes.

- Every write operation updates the graph ref (or creates an anchor commit)
- Reachability from the ref is maintained automatically
- Users do not need to manage refs or call sync manually

### Manual Mode

In manual mode, EmptyGraph provides no automatic ref management.

- Writes create commits but do not update refs
- User is responsible for calling `sync()` to persist reachability
- User may manage refs directly via Git commands
- **Warning**: Uncommitted writes are subject to garbage collection

## Anchor Commits

Anchor commits solve the reachability problem for disconnected graphs.

### When Anchors Are Created

An anchor commit is created when a new node is not a descendant of the
current ref tip. This occurs when:

- Creating a disconnected root node
- Importing commits from external sources
- Merging unrelated graph histories

### Anchor Structure

Anchor commits have the following properties:

- **Parents**: `[old_tip, new_commit, ...]` - includes both the previous ref
  tip and all newly unreachable commits
- **Payload**: `{"_type":"anchor"}` - marker identifying the commit as an anchor
- **Purpose**: Maintains reachability without affecting graph semantics

Anchor commits are internal bookkeeping and should be transparent to
graph traversal operations.

## Sync Algorithm

The `sync()` operation ensures a commit becomes reachable from the graph ref.

```
sync(ref, new_commit):
    if ref does not exist:
        set ref → new_commit

    else if ref_tip is ancestor of new_commit:
        fast-forward ref → new_commit

    else:
        anchor = create_commit(
            parents: [ref_tip, new_commit],
            payload: {"_type":"anchor"}
        )
        set ref → anchor
```

### Cases

| Condition | Action | Result |
|-----------|--------|--------|
| Ref missing | Create ref | `ref → new_commit` |
| Linear history | Fast-forward | `ref → new_commit` |
| Divergent history | Anchor | `ref → anchor → [old_tip, new_commit]` |

## Guarantees

1. In managed mode, any successfully returned write is durable
2. Anchor commits preserve all previously reachable history
3. The sync algorithm is idempotent for the same inputs
4. Graph semantics are unaffected by anchor commits

## Non-Guarantees

1. In manual mode, writes may be lost to garbage collection
2. Anchor commit ordering is not semantically meaningful
3. Concurrent writes may create multiple anchors (all valid)
