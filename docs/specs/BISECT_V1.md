# BISECT V1 Specification

> **Status:** Spec only (M10). Implementation deferred to M11.
> **Author:** James Ross
> **Date:** 2026-02-26

## 1. Overview

Causality bisect finds the first patch (or tick) in a WARP graph's history that introduced a user-defined invariant violation. It is `git bisect` for WARP graphs: given a known-good state and a known-bad state, it narrows the causal range to identify the offending patch.

## 2. CLI Contract

```text
git warp bisect --graph <name> --good <sha> --bad <sha> --test <command>
git warp bisect --graph <name> --good <sha> --bad <sha> --test <command> [--writer <id>] [--json]
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--graph <name>` | Yes | Graph name |
| `--good <sha>` | Yes | Commit SHA of a known-good state (invariant holds) |
| `--bad <sha>` | Yes | Commit SHA of a known-bad state (invariant violated) |
| `--test <command>` | Yes | Shell command to test invariant. Exit 0 = good, non-zero = bad. |
| `--writer <id>` | No | Constrain bisect to a single writer's chain (linearizes range). |
| `--json` | No | JSON output |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Found: first bad patch identified |
| 1 | Usage error (invalid args) |
| 2 | Range error (good is not ancestor of bad, empty range, or both same) |
| 3 | Internal error |

### Output

```text
# Text mode (default)
First bad patch: <sha>
  Writer: <writerId>
  Lamport: <n>
  Steps: <k> of <total candidates>

# JSON mode (--json)
{
  "result": "found",
  "firstBadPatch": "<sha>",
  "writerId": "<id>",
  "lamport": <n>,
  "steps": <k>,
  "totalCandidates": <n>
}
```

## 3. Data Model

```javascript
/**
 * @typedef {Object} BisectState
 * @property {string} good - SHA of known-good state
 * @property {string} bad - SHA of known-bad state
 * @property {string[]} candidates - Ordered list of candidate SHAs between good and bad
 * @property {string|null} current - SHA currently being tested
 * @property {number} step - Current step number (1-based)
 * @property {number} totalCandidates - Initial candidate count
 * @property {Map<string, 'good'|'bad'>} tested - SHAs already tested with results
 */
```

## 4. Algorithm

### 4.1 Correctness Contract

**Monotonicity requirement:** For bisect to produce correct results, the tested property must be _monotone_ along the selected order: if patch P is "bad," all descendants of P must also be "bad." If this does not hold (e.g., a bug is introduced and then fixed), bisect may return an incorrect result.

**V1 scope:** V1 supports **linearizable ranges** — either a single writer's chain (inherently linear) or the merged mainline when a `--writer` is specified. General multi-writer DAG bisect is **best-effort** without monotonicity guarantees.

For general DAGs, the candidate set is a partial order. Binary search on a total ordering (topological sort) can pick a node whose test result does not properly shrink the candidate set. V1 acknowledges this limitation and recommends `--writer` for reliable results on multi-writer graphs.

### 4.2 Single-Writer / Linearized Bisect

When `--writer <id>` is provided, or the graph has a single writer:

1. **Enumerate candidates:** Walk the writer's chain from `good` (exclusive) to `bad` (inclusive). Result is a linear list `[c₁, c₂, ..., cₙ]` in chronological order.
2. **Validate range:**
   - If `good` is not an ancestor of `bad` → exit 2 (range error).
   - If `good === bad` → exit 2.
   - If candidate list is empty → exit 2.
3. **Binary search:** Pick midpoint `cₘ = candidates[⌊n/2⌋]`.
4. **Materialize at candidate:** Use `seek --tick` or materialize from genesis through `cₘ` to produce the graph state at that point.
5. **Run test:** Execute the user-provided `--test` command. The command receives the materialized state (via env vars or temp repo).
6. **Narrow:**
   - If test exits 0 (good): discard `[c₁, ..., cₘ]`, set `good = cₘ`.
   - If test exits non-zero (bad): discard `[cₘ₊₁, ..., cₙ]`, set `bad = cₘ`.
7. **Repeat** steps 3–6 until one candidate remains. That candidate is the first bad patch.

**Complexity:** O(log N) materializations, where N is the number of patches between good and bad.

### 4.3 Multi-Writer DAG Bisect (Best-Effort)

When no `--writer` is specified and the graph has multiple writers:

1. **Enumerate candidates:** Compute the set of patches reachable from `bad` but not from `good` using `DagTraversal.ancestors()`.
2. **Validate range:** Same as 4.2.
3. **Weight-based candidate selection:** Instead of binary search on a topological sort index, pick the candidate that roughly halves the remaining candidate set by **reachability weight**:
   - For each candidate `c`, compute `weight(c) = |ancestors(c) ∩ candidates|`.
   - Pick the candidate whose weight is closest to `|candidates| / 2`.
   - This is the git-style "bisect by commit weight" approach.
4. **Materialize, test, and narrow** as in 4.2, using reachability to partition rather than list indices:
   - If good: remove `c` and all ancestors of `c` from candidates.
   - If bad: remove all non-ancestors of `c` from candidates (keep only ancestors + `c`).
5. **Repeat** until one candidate remains.

**Warning:** If the tested property is not monotone across the DAG, the result may be incorrect. The CLI should emit a warning when using DAG bisect without `--writer`.

### 4.4 Algorithm Pseudocode

```text
function bisect(good, bad, testCmd, writer?):
  if writer:
    candidates = walkWriterChain(good, bad, writer)
  else:
    candidates = ancestors(bad) \ ancestors(good)

  if candidates.empty: return RANGE_ERROR

  while candidates.size > 1:
    if writer:
      mid = candidates[floor(candidates.size / 2)]
    else:
      mid = argmin_c |weight(c) - candidates.size / 2|

    state = materializeAt(mid)
    result = runTest(testCmd, state)

    if result == GOOD:
      candidates = candidates.filter(c => !isAncestorOf(c, mid) && c != mid)
    else:
      candidates = candidates.filter(c => isAncestorOf(c, mid) || c == mid)

  return candidates[0]  // first bad patch
```

## 5. Infrastructure Reuse

| Component | Usage |
|-----------|-------|
| `DagTopology.topologicalSort()` | Linearize candidate set for display |
| `DagTraversal.ancestors()` | Compute candidate set and reachability |
| `DagTraversal.isReachable()` | Validate good→bad ancestry |
| `seek --tick` / `materialize()` | Produce state at candidate point |
| `CommitDagTraversalService` | Walk commit DAG |

## 6. Test Vectors

### Vector 1: Linear chain (single writer)

```text
Commits: A → B → C → D → E
Good: A, Bad: E
Property: node "bug" absent (good) / present (bad)
"bug" introduced at: C

Expected bisect steps:
  Step 1: test C → bad → narrow to [B, C]
  Step 2: test B → good → result = C
Result: C (2 steps)
```

### Vector 2: Multi-writer diamond

```text
Writer w1: A → B → D
Writer w2: A → C → D
Good: A, Bad: D
"bug" introduced by w2 at C

Expected: bisect identifies C
Note: weight-based selection may test B or C first
```

### Vector 3: Already good

```text
Commits: A → B → C
Good: C, Bad: C
Expected: exit 2 (range error — good equals bad)
```

### Vector 4: Already bad

```text
Commits: A → B → C
Good: A, Bad: A
Expected: exit 2 (range error — good equals bad)
```

### Vector 5: Single step

```text
Commits: A → B
Good: A, Bad: B
Expected: result = B (0 bisect steps — only one candidate)
```

### Vector 6: Good is not ancestor of bad

```text
Writer w1: A → B
Writer w2: C → D
Good: B, Bad: D (B is not an ancestor of D)
Expected: exit 2 (range error)
```

### Vector 7: Non-monotone property (warning case)

```text
Commits: A → B → C → D
Good: A, Bad: D
Property at B: bad, at C: good, at D: bad (non-monotone)
Expected: bisect may return B or D (non-monotone — result unreliable)
Note: CLI should warn about potential non-monotonicity in multi-writer mode
```

## 7. Future Work (M11)

- Full implementation of `git warp bisect` command
- Automatic monotonicity detection (test boundary candidates first)
- Interactive mode (user manually marks good/bad)
- State caching between bisect steps
- `--first-parent` flag for mainline-only bisect in multi-writer graphs
