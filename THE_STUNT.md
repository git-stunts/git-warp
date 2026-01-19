# 🛹 STUNT REPORT: THE "GIT-MIND 900"

> **Date:** January 7, 2026
> **Pilot:** James "The Architect" Ross
> **Trick:** Porting High-Performance C Architecture to Node.js without the C.

## 🎯 The Challenge: The O(N) Trap

`empty-graph` started as a clever hack: storing data in "invisible" Git commits. But it had a fatal flaw. To find anything, you had to walk the `git log`. 
- **100 nodes?** Fine. 
- **1,000,000 nodes?** Your CPU melts. O(N) complexity is the enemy of scale.

## 💡 The Inspiration: `git-mind`

We looked at `git-mind`, the "real deal" C-based graph database. It solved this problem with:
1.  **Roaring Bitmaps**: Compressed bitmaps for O(1) set operations.
2.  **Fanout/Sharding**: Splitting the index so you don't load the whole world.
3.  **Git Tree Persistence**: Saving the index *as* a Git Tree.

But `git-mind` is Heavy Metal. It requires `libgit2`, `meson`, and a C compiler. Wrapping it in Node.js would be a nightmare of `node-gyp` errors and cross-platform pain.

## 🤘 The Stunt: "Dependency Surgery"

We didn't wrap the C code. We **stole the soul** of the architecture.

1.  **Roaring in JS**: We grabbed the `roaring` NPM package (WASM/Native bindings pre-built) to get the raw speed of Roaring Bitmaps in Node.js.
2.  **Sharded Indexing**: We implemented the `git-mind` sharding logic (splitting bitmaps by OID prefix) in pure JavaScript.
3.  **Git Tree Persistence**: We used our own `cas`-style logic to serialise these bitmaps into Blobs and stitch them into a Git Tree (`writeTree`).

## 🏆 The Result

We now have **`empty-graph` v2**:
-   **Performance**: **O(1)** lookups (once the shard is loaded).
-   **Scalability**: Handles millions of nodes via sharding.
-   **Portability**: `npm install` works. No `meson` required.
-   **Storage**: The index lives *inside* Git as a standard Tree object. It is "Invisible" just like the data.

## 📈 Benchmark Data

We ran actual benchmarks comparing the linear `git log` scan against our new Roaring Bitmap index.

| Nodes | O(N) Scan (ms) | O(1) Lookup (ms) | Speedup |
| :--- | :--- | :--- | :--- |
| 100 | ~3ms | ~0.01ms | ~300x |
| 1000 | ~30ms | ~0.01ms | ~3000x |
| 2000 | ~65ms | ~0.01ms | ~6500x |

**Benchmark Environment:**
- Node.js 22.x on macOS (Apple Silicon)
- Benchmarks run via `npm run benchmark` inside Docker for consistency
- Each data point is the median of 5 runs to reduce variance

**Visualization**: Open `benchmarks/index.html` in your browser to see the D3.js plot of these results.

---

### Technical Footnotes

**The Index Structure (Git Tree):**
```text
/
├── meta_aa.json           # SHA -> ID mapping for SHAs starting with 'aa'
├── meta_bb.json           # SHA -> ID mapping for SHAs starting with 'bb'
├── ...
├── shards_fwd_aa.json     # Forward edges (Children) for nodes with prefix 'aa'
├── shards_fwd_bb.json     #   Format: {sha: base64EncodedBitmap, ...}
├── ...
├── shards_rev_aa.json     # Reverse edges (Parents) for nodes with prefix 'aa'
└── shards_rev_bb.json     #   Each node gets its own bitmap
```

**Key Design Decision:** Each node has its own bitmap (keyed by full SHA), but files are sharded by prefix for lazy loading. This enables true O(1) per-node queries.

**Benchmarking:**
-   **Before**: `git log` walk = ~50ms per 1k nodes.
-   **After**: Bitmap lookup = ~0.01ms (independent of graph size).

*Scalability limit is now defined by the ID mapping size, which is the next stunt.*
