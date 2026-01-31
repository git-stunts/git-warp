# Anchor Commits: How EmptyGraph Maintains Durability

## The Problem

Git garbage collection (GC) prunes commits that are not reachable from any ref. EmptyGraph nodes are Git commits, so without careful ref management, your data can be silently deleted.

## The Solution: Anchor Commits

EmptyGraph uses "anchor commits" to ensure all nodes remain reachable from the graph's managed ref.

### What is an Anchor Commit?

An anchor commit is a special commit with:
- Message: `{"_type":"anchor"}`
- Parents: The commits that need to be kept reachable
- Tree: The empty tree (same as all EmptyGraph nodes)

Anchor commits are infrastructure—they don't represent domain data and are filtered from E graph queries.

### When Are Anchors Created?

**Linear history (no anchor needed):**
```
Before:     fix → A
After:      fix → A ← B   (B has parent A)
Result:     Fast-forward, no anchor
```

**Disconnected root (anchor needed):**
```
Before:     fix → A
After:      fix → ANCHOR
                  /    \
                 A      B   (B has no connection to A)
```

### Anchoring Strategies

#### 1. Chained Anchors (per-write sync)

Each disconnected write creates one anchor with 2 parents:

```
fix → A3 → A2 → A1 → ...
       \    \    \
        D    C    B    (real nodes)
```

- **Pro**: Simple, stateless, works for incremental writes
- **Con**: O(N) anchor commits for N disconnected tips

#### 2. Octopus Anchors (batch mode)

Single anchor with N parents for all tips:

```
fix → ANCHOR
      /|\ \
     A B C D   (all real nodes as direct parents)
```

- **Pro**: O(1) anchor overhead regardless of structure
- **Con**: Requires knowing all tips upfront

#### 3. Hybrid (what EmptyGraph does)

- **`autoSync: 'onWrite'`**: Uses chained anchors with fast-forward optimization
- **`beginBatch()`**: Uses octopus anchor on commit()
- **`compactAnchors()`**: Rewrites chains to octopus for cleanup

## Traversal Complexity Impact

### If Anchors Are Filtered (correct behavior)

| Metric | Chained | Octopus |
|--------|---------|---------|
| E nodes visible | N (real only) | N (real only) |
| E traversal | O(V + E) | O(V + E) |
| No impact on domain graph | ✓ | ✓ |

### Index Rebuild Overhead

| Metric | Chained | Octopus |
|--------|---------|---------|
| L commits to iterate | N + O(N) anchors | N + O(1) anchors |
| Overhead | ~2x in worst case | ~none |

This is why `Batch.commit()` uses octopus—bulk imports avoid the 2x penalty.

## The Sync Algorithm

```
syncHead(ref, newSha):
  1. Read current ref tip R
  2. If R is null: set ref → newSha (first write)
  3. If R == newSha: no-op (idempotent)
  4. If R is ancestor of newSha: fast-forward ref → newSha
  5. Else: create anchor(R, newSha), set ref → anchor
```

Step 4 is the key optimization—linear history creates zero anchors.

## Best Practices

1. **Use managed mode** for automatic durability
2. **Use batching** for bulk imports (octopus = efficient)
3. **Call `compactAnchors()`** periodically if you have many incremental writes
4. **Don't worry about anchors** in your domain logic—they're invisible to E traversals
