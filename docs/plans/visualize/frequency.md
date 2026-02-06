# Visualization Frequency Ranking

This document ranks visualization modes by expected frequency of use, from most common to most specialized.

## Feasibility vs. Frequency

This document was originally ranked by **expected usage frequency** alone. This update adds **implementation feasibility** based on detailed codebase analysis of `@git-stunts/git-warp` v7.0.0.

**Key findings:**
- Some high-frequency visualizations require significant new implementation or cannot be directly implemented as described in the AION papers
- The codebase uses a **flat model** (skeleton + properties via CRDT) rather than the recursive attachment hierarchy described in Paper I
- Several paper concepts (wormholes, observer distance, temporal logic) have no existing backend support
- However, core primitives (patches, version vectors, materialization, traversal) are production-ready

**Recommended build order now balances BOTH frequency AND feasibility**, prioritizing visualizations that can ship quickly with existing infrastructure.

---

## Ranking Criteria

- **Frequency**: How often users will need this visualization
- **Audience**: Who will use it (developers, auditors, researchers)
- **Context**: When it's needed in typical workflows

---

## Tier 1: Daily Use (Core Workflow)

### 1. Two-Plane State Explorer
**Frequency: ★★★★★ (Very High)** | **Feasibility: ⚠️ 60% (Adapted)**

| Factor | Assessment |
|--------|------------|
| Who | All developers working with WARP graphs |
| When | Debugging, understanding state, exploring data |
| Why | This is the fundamental "what does my graph look like" view |

This is the **bread and butter** visualization. Anyone working with WARP needs to see the current state: what nodes exist, what edges connect them, and what's attached. It's the equivalent of a file browser or database inspector.

> ⚠️ **Implementation Note**: The codebase uses a flat model (skeleton + properties), not recursive attachments as described in Paper I. This visualization must be adapted as a **"Graph + Property Explorer"** rather than true two-plane recursive drill-down. The skeleton plane (nodes/edges via OR-Set) and property plane (LWW registers) can be visualized separately, but there is no "attachments within attachments" hierarchy.

**Adaptation**: Show graph topology in one pane, property inspector in another. Properties are flat key-value pairs on nodes/edges, not nested WARP graphs.

**ASCII priority**: HIGH - Essential for terminal-only environments

---

### 2. Holographic Reconstruction
**Frequency: ★★★★☆ (High)** | **Feasibility: ✅ 95% (Ready)**

| Factor | Assessment |
|--------|------------|
| Who | Developers, QA, anyone replaying state |
| When | Debugging issues, verifying correctness, auditing |
| Why | "Show me how we got here" is a constant question |

Replaying boundary data to see the worldline is critical for debugging and understanding causation. When something goes wrong, the first question is "what happened?" This viewer answers that.

> ✅ **Implementation Note**: Fully supported by existing infrastructure. `WarpGraph.materialize()` replays all patches in deterministic order. `JoinReducer` handles CRDT merge. Per-writer patch chains under `refs/warp/<graph>/writers/<writerId>` provide the ordered payload. Checkpoints enable fast-forward replay.

**Backend ready**: `materialize()`, `JoinReducer`, `PatchBuilderV2`, `CheckpointService` all production-ready. UI needs 1-2 weeks.

**ASCII priority**: HIGH - Replay status and progress work well in terminal

---

### 3. Tick Receipt Theater
**Frequency: ★★★★☆ (High)** | **Feasibility: ⚠️ 50% (Adapted)**

| Factor | Assessment |
|--------|------------|
| Who | Developers debugging concurrency, scheduler analysis |
| When | Understanding why a specific state was committed |
| Why | "Why was this match chosen over that one?" |

When developers need to understand the internal scheduler decisions, this is the go-to. It's essential for debugging determinism issues and understanding conflict resolution.

> ⚠️ **Implementation Note**: The codebase does not implement DPOI rewriting with explicit match/reject events as described in Paper II. Conflict resolution happens implicitly via CRDT merge (OR-Set add-wins, LWW timestamp ordering). There are no "tick receipts" or "admissible batches" — patches are applied independently per writer, then merged deterministically.

**Adaptation**: Implement as **"Receipt Inspector"** showing CRDT merge outcomes: which adds won, which removes observed which dots, which LWW values won based on EventId ordering. Can visualize version vector advancement and conflict resolution decisions from `JoinReducer` internals.

**ASCII priority**: MEDIUM - Matrix views work in terminal, animations need GUI

---

## Tier 2: Regular Use (Feature Workflow)

### 4. Wormhole Compression Viewer
**Frequency: ★★★☆☆ (Medium-High)** | **Feasibility: ❌ 20% (Blocked)**

| Factor | Assessment |
|--------|------------|
| Who | Operations, checkpoint management, storage optimization |
| When | Checkpointing, archiving, transferring worldlines |
| Why | Compression is critical for practical system operation |

Wormholes are how the system manages storage and checkpoints. Anyone dealing with persistence, replication, or archiving will use this regularly.

> ❌ **Implementation Note**: Wormholes as described in Paper III (compressed multi-tick segments with sub-payloads) are **not implemented**. The codebase has `CheckpointService` for state snapshots, but these are full materialized state dumps, not hierarchical wormhole compression. Roadmap shows wormhole support planned for v8.0.0 (HG/WORM/1).

**Blocked**: Requires v8.0.0 wormhole implementation. Current checkpoints can be visualized but lack the nested structure described in the papers.

**ASCII priority**: MEDIUM - Compression stats and structure work in terminal

---

### 5. Causal Cone Slicer
**Frequency: ★★★☆☆ (Medium)** | **Feasibility: ✅ 95% (Ready)**

| Factor | Assessment |
|--------|------------|
| Who | Developers querying specific values, auditors |
| When | "How did this value get computed?" |
| Why | Targeted debugging without full replay |

When you need to understand the provenance of a specific value without replaying everything, slicing is the tool. It's the "git blame" equivalent for computed values.

> ✅ **Implementation Note**: Fully supported. `LogicalTraversal` provides BFS/DFS/shortest-path over the graph. `CommitDagTraversalService` walks the Git commit DAG. Property provenance can be traced via LWW EventIds back to the patch that set them. The `derivation graph D(v) = backward causal cone` from Paper III maps directly to traversing patch dependencies.

**Backend ready**: `LogicalTraversal`, `CommitDagTraversalService`, `QueryBuilder` all support cone computation. UI needs 1-2 weeks.

**ASCII priority**: MEDIUM - Cone structure and slice info work in terminal

---

## Tier 3: Periodic Use (Analysis Workflow)

### 6. Multiway Worldline Viewer
**Frequency: ★★☆☆☆ (Medium-Low)** | **Feasibility: ⚠️ 40% (Partial)**

| Factor | Assessment |
|--------|------------|
| Who | Researchers, advanced developers, counterfactual analysis |
| When | "What if we had taken the other branch?" |
| Why | Understanding the possibility space, confluence analysis |

This is more analytical than operational. Most users care about the worldline that was taken, but researchers and advanced users explore alternatives.

> ⚠️ **Implementation Note**: The codebase does not implement the full `Hist(U, R)` history category or multiway graph `MW(U, R)` from Paper IV. However, multi-writer divergence and merge IS supported: each writer has an independent patch chain, and `materialize()` deterministically merges them. Git's DAG structure captures fork/merge topology.

**Adaptation**: Implement as **"Fork & Merge Viewer"** showing per-writer patch chains and how they merge. Can visualize version vector advancement, writer divergence, and sync points. Not true counterfactual exploration, but shows the actual multi-writer history.

**ASCII priority**: LOW - Complex branching visualization needs GUI for clarity

---

### 7. Observer Distance Map
**Frequency: ★★☆☆☆ (Medium-Low)** | **Feasibility: ❌ 15% (Research)**

| Factor | Assessment |
|--------|------------|
| Who | System architects, security auditors, API designers |
| When | Designing observer interfaces, audit requirements |
| Why | Understanding translation costs between perspectives |

This is a meta-visualization about the system itself rather than specific data. Useful when designing APIs or understanding what different stakeholders can see.

> ❌ **Implementation Note**: Observer geometry from Paper IV (functors `O: Hist(U, R) -> Tr`, translators, MDL description length, rulial distance) is **not implemented**. The codebase has no concept of observers, trace spaces, or translation costs. This is pure research-tier functionality.

**Research tier**: Would require implementing the full observer framework from Paper IV. No existing backend support. Consider as long-term research goal.

**ASCII priority**: LOW - Distance matrix works in terminal, graph view needs GUI

---

### 8. Temporal Logic Satisfaction
**Frequency: ★☆☆☆☆ (Low)** | **Feasibility: ❌ 10% (Research)**

| Factor | Assessment |
|--------|------------|
| Who | Formal verification users, safety-critical systems |
| When | Verifying properties, compliance checking |
| Why | "Prove that this property always holds" |

This is specialized tooling for formal verification. Most users won't write temporal formulas, but for safety-critical systems or formal methods users, it's essential.

> ❌ **Implementation Note**: CTL*-style temporal logic from Paper IV is **not implemented**. The codebase has no temporal logic parser, no model checker, and no witness generation. This requires a complete formal verification stack.

**Research tier**: Would require implementing a temporal logic engine, model checker, and witness path generator. No existing backend support. Consider as long-term research goal, possibly via external tool integration.

**ASCII priority**: LOW - Formula evaluation works in terminal, witness paths need GUI

---

## Summary Table

The table below is ordered by **build priority** (feasibility-adjusted), not by the frequency ranking used in the body sections above.

| Build Priority | Visualization | Frequency | Feasibility | Notes |
|----------------|---------------|-----------|-------------|-------|
| 1 | Causal Cone Slicer | ★★★☆☆ | ✅ 95% | Ready |
| 2 | Holographic Reconstruction | ★★★★☆ | ✅ 95% | Ready |
| 3 | Two-Plane Explorer | ★★★★★ | ⚠️ 60% | Adapted |
| 4 | Tick Receipt Theater | ★★★★☆ | ⚠️ 50% | Adapted |
| 5 | Multiway Worldline | ★★☆☆☆ | ⚠️ 40% | Partial |
| 6 | Wormhole Compression | ★★★☆☆ | ❌ 20% | Blocked |
| 7 | Observer Distance Map | ★★☆☆☆ | ❌ 15% | Research |
| 8 | Temporal Logic | ★☆☆☆☆ | ❌ 10% | Research |

### Legend
- **✅ Ready**: Full backend support, UI work only
- **⚠️ Adapted**: Requires design changes from paper concepts to match codebase reality
- **❌ Blocked/Research**: Missing backend infrastructure or purely theoretical

---

## Implementation Priority

Based on **feasibility-adjusted ranking**, the recommended implementation order:

### Phase 1: Ready Now
These visualizations have full backend support and can ship with 1-2 weeks of UI work each.

1. **Causal Cone Slicer** — Full backend (`LogicalTraversal`, `CommitDagTraversalService`, `QueryBuilder`). Trace any value back to its producing patch. High value for debugging and auditing.

2. **Holographic Reconstruction** — Full backend (`materialize()`, `JoinReducer`, `CheckpointService`). Replay worldline from boundary data. Essential for understanding "how did we get here?"

### Phase 2: Adapted Versions
These require design adaptation from paper concepts to match codebase reality.

3. **Two-Plane Explorer** → **"Graph + Property Explorer"** (flat model)
   - Adaptation: Split view of skeleton (nodes/edges) and properties (LWW registers)
   - No recursive drill-down, but covers the practical use case

4. **Tick Receipt Theater** → **"Receipt Inspector"** (CRDT outcomes)
   - Adaptation: Visualize CRDT merge decisions rather than DPOI match/reject
   - Show OR-Set dot observation, LWW winner selection, version vector advancement

5. **Multiway Worldline** → **"Fork & Merge Viewer"** (explicit forks)
   - Adaptation: Per-writer patch chains and merge topology
   - Not counterfactual exploration, but shows actual multi-writer history

### Phase 3: Blocked / Future
These require backend work before visualization is possible.

6. **Wormhole Compression** — Blocked until v8.0.0 (HG/WORM/1)
   - Current checkpoints are flat snapshots, not hierarchical wormholes
   - Can visualize checkpoint metadata but not nested structure

7. **Observer Distance Map** — Research tier
   - Requires implementing Paper IV observer framework
   - No existing backend support; pure research goal

8. **Temporal Logic** — Research tier
   - Requires implementing temporal logic engine and model checker
   - Consider external tool integration (e.g., NuSMV, Spin)

---

## ASCII/Terminal Notes

All visualizations include ASCII versions for terminal use. Priority for terminal implementation:

**Must have ASCII (Phase 1)**:
- Two-Plane Explorer: Tree/graph layout in terminal
- Holographic Reconstruction: Progress bars, state diffs

**Should have ASCII (Phase 2)**:
- Tick Receipt Theater: Match tables, blocking relationships
- Wormhole Compression: Compression stats, segment info
- Causal Cone Slicer: Dependency tree, slice summary

**Nice to have ASCII (Phase 3)**:
- Multiway Worldline: Simplified branching diagram
- Observer Distance Map: Distance matrix
- Temporal Logic: Formula evaluation, counterexample trace

---

## Usage Contexts

### Interactive Development
- Two-Plane Explorer (constant)
- Holographic Reconstruction (frequent)
- Tick Receipt Theater (when debugging)

### CI/CD Pipeline
- Holographic Reconstruction (verify replay)
- Causal Cone Slicer (verify specific outputs)
- Temporal Logic (property checking)

### Production Operations
- Wormhole Compression (checkpointing)
- Two-Plane Explorer (inspection)
- Holographic Reconstruction (incident analysis)

### Security Audit
- Holographic Reconstruction (full replay)
- Causal Cone Slicer (provenance)
- Observer Distance Map (access analysis)

### Research/Analysis
- Multiway Worldline (branching exploration)
- Temporal Logic (property verification)
- Observer Distance Map (theoretical analysis)
