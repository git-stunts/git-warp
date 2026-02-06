# Agent Handoff: WARP Visualization Planning

## Context

You are continuing work on **git-warp-viewer**, a visualization tool for WARP graphs. Planning is in progress—we have defined 8 visualization modes with mockups but have not finalized implementation details or started coding.

---

## What Are WARP Graphs?

**WARP** = **W**orldline **A**lgebra for **R**ecursive **P**rovenance

WARP graphs are a mathematical foundation for multi-writer, conflict-free graph databases that use Git commits as storage. The theory is developed across four academic papers (the AION Foundations Series) by James Ross.

### The Four Papers

| Paper | Title | Core Concept |
|-------|-------|--------------|
| **I** | WARP Graphs: A Worldline Algebra for Recursive Provenance | Static structure: "graphs all the way down" - finite skeleton with recursively attached WARPs at vertices and edges |
| **II** | Canonical State Evolution and Deterministic Worldlines | Dynamics: ticks as atomic work units, scheduler-admissible batches, tick-level confluence, two-plane commutation |
| **III** | Computational Holography & Provenance Payloads | Provenance: boundary encoding (U₀, P) reconstructs interior, slicing, wormholes, BTRs |
| **IV** | Rulial Distance & Observer Geometry | Observers: functors to trace space, MDL-based translation cost, Chronos/Kairos/Aion time model, CTL* temporal logic |

### Key Mathematical Objects

```text
WARP State:        U = (G; α, β)
                   G = skeleton (typed open graph)
                   α = vertex attachments (recursive WARPs)
                   β = edge attachments (recursive WARPs)

Tick:              Atomic unit of concurrent work
                   - Attachment-plane steps (local rewrites)
                   - Skeleton batch (global wiring changes)
                   - Tick receipt records accepted/rejected matches

Provenance Payload: P = (μ₀, μ₁, ..., μₙ₋₁)
                   Ordered sequence of tick patches
                   Forms a monoid under concatenation

Boundary Encoding: B = (U₀, P)
                   Initial state + payload
                   Information-complete for interior (holography)

Wormhole:          Compressed multi-tick segment
                   W = (Uᵢ, P_{i:k}, Uᵢ₊ₖ)

Observer:          O : Hist(U, R) → Tr
                   Functor from history category to trace space
                   Resource-bounded by (τ, m)

Rulial Distance:   D_{τ,m}(O₁, O₂)
                   Translation cost between observers
                   DL(T) + λ·Dist(O₂, T∘O₁)

Time Model:        Chronos = linear worldline time
                   Kairos = branch-event structure
                   Aion = full possibility space (Ruliad)
```

---

## What This Repo Does

`git-warp-viewer` will be a visualization tool for the `@git-stunts/git-warp` package. The main WARP implementation lives in the parent repo; this is specifically for visualization.

### Parent Repo Structure (for reference)
```text
../git-warp/
├── src/domain/WarpGraph.js          # Main API
├── src/domain/services/
│   ├── JoinReducer.js               # CRDT merge (OR-Set + LWW)
│   ├── PatchBuilderV2.js            # Patch construction
│   ├── CheckpointService.js         # Wormhole creation
│   ├── QueryBuilder.js              # Graph queries
│   └── LogicalTraversal.js          # BFS, DFS, paths
├── src/domain/crdt/                  # VersionVector, ORSet, etc.
└── examples/html/                    # Existing basic visualizations
```

---

## What We've Done So Far

### 1. Read and Analyzed the Papers
Located at:
- `~/git/aion-paper-01/paper/main.tex`
- `~/git/aion-paper-02/paper/main.tex`
- `~/git/aion-paper-03/paper/main.tex`
- `~/git/aion-paper-04/paper/main.tex`

### 2. Created Visualization Plans
All plans are in: **`docs/plans/visualize/`**

| File | Visualization | Priority |
|------|---------------|----------|
| `two-plane-explorer.md` | Skeleton + attachment browser | ★★★★★ |
| `holographic-reconstruction.md` | Boundary → interior replay | ★★★★☆ |
| `tick-receipt-theater.md` | Scheduler conflict animation | ★★★★☆ |
| `wormhole-compression.md` | Segment collapse/expand | ★★★☆☆ |
| `causal-cone-slicer.md` | Derivation graph D(v) | ★★★☆☆ |
| `multiway-worldline.md` | Chronos through Aion | ★★☆☆☆ |
| `observer-distance-map.md` | Rulial distance geometry | ★★☆☆☆ |
| `temporal-logic-satisfaction.md` | CTL* formula checking | ★☆☆☆☆ |
| `frequency.md` | Usage ranking rationale | — |
| `README.md` | Index and overview | — |

### 3. Created SVG Mockups
Each visualization plan includes:
- **SVG mockups** (extracted to standalone `.svg` files)
- **ASCII terminal versions** (for CLI/SSH use)
- **Interaction sequences** (user flow diagrams)
- **Feature descriptions**
- **Technical notes**

Total: **18 SVG mockup files** created.

---

## Feasibility Analysis Results

### Critical Finding: Paper vs. Implementation Gap

The git-warp codebase implements Papers I-III with pragmatic simplifications. Paper IV concepts are largely theoretical. Key gaps:

| Paper Concept | Implementation Reality |
|---------------|----------------------|
| Recursive attachments (α, β) | Flat properties (LWW registers) |
| Atom(p) terminal types | String node IDs with properties |
| DPO rewriting with scheduler | CRDT merge (OR-Set + LWW) |
| Footprint analysis (Del/Use) | Implicit via CRDT semantics |
| Wormhole compression | Checkpoints only (wormholes planned for v8.0.0) |
| Observer geometry | Not implemented |
| Temporal logic (CTL*) | Not implemented |

### Visualization Feasibility Scores

| Visualization | Score | Status |
|---------------|-------|--------|
| Causal Cone Slicer | ✅ 95% | Ready - full backend |
| Holographic Reconstruction | ✅ 95% | Ready - full backend |
| Two-Plane Explorer | ⚠️ 60% | Adapt to flat model |
| Tick Receipt Theater | ⚠️ 50% | Adapt to CRDT outcomes |
| Multiway Worldline | ⚠️ 40% | Fork visualization only |
| Wormhole Compression | ❌ 20% | Blocked on v8.0.0 |
| Observer Distance Map | ❌ 15% | Paper IV theory only |
| Temporal Logic | ❌ 10% | Paper IV theory only |

### Recommended Build Order

1. **Causal Cone Slicer** — Backend ready, build UI (1-2 weeks)
2. **Holographic Reconstruction** — Backend ready, build UI (1-2 weeks)
3. **Graph + Property Explorer** — Adapted Two-Plane for flat model
4. **Receipt Inspector** — Adapted Tick Receipt for CRDT outcomes
5. **Fork & Merge Viewer** — Adapted Multiway for explicit forks
6. **Wormhole Compression** — Wait for v8.0.0
7-8. **Observer/Temporal** — Research tier, lowest priority

---

## CLI Visualization Integration

The git-warp CLI can be extended with `--view` flags for inline visualizations. See **`docs/plans/visualize/cli-visualizations.md`** for full details.

### Current CLI Commands

| Command | Purpose | Current Output |
|---------|---------|----------------|
| `git warp info` | List graphs in repo | Text/JSON graph summary |
| `git warp query` | Query nodes with patterns | Text/JSON node list |
| `git warp path` | Find shortest path | Text/JSON path result |
| `git warp history` | Show writer patch history | Text/JSON patch list |
| `git warp check` | Health and GC status | Text/JSON health report |
| `git warp materialize` | Create checkpoints | Text/JSON checkpoint result |

### Proposed `--view` Flag Additions

| Command | `--view` Output | Feasibility |
|---------|-----------------|-------------|
| `info --view` | Writer timelines, status badges | ✅ Ready |
| `query --view` | Force-directed subgraph | ✅ Ready |
| `path --view` | Path diagram with hops | ✅ Ready |
| `history --view` | Patch timeline with operations | ✅ Ready |
| `check --view` | Health dashboard with bars | ✅ Ready |

### Proposed New Visualization Commands

| Command | Purpose | Maps To |
|---------|---------|---------|
| `git warp view` | Interactive graph browser | Two-Plane Explorer |
| `git warp replay --view` | Animated reconstruction | Holographic Reconstruction |
| `git warp slice --view` | Causal cone visualization | Causal Cone Slicer |
| `git warp diff --view` | State comparison | (new) |

### View Output Modes

```bash
--view              # ASCII in terminal (default)
--view=ascii        # Explicit ASCII mode
--view=svg:FILE     # Write SVG to file
--view=html:FILE    # Write HTML to file
--view=browser      # Open interactive view in browser
```

---

## Key Files to Read

### Must Read
1. **`docs/plans/VIEWER_ROADMAP.md`** — Implementation roadmap with milestones and tasks
2. **`docs/plans/TECH_DECISIONS.md`** — Technology choices (D3, ANSI, CLI integration)
3. **`docs/plans/visualize/README.md`** — Visualization index with feasibility scores
4. **`docs/plans/visualize/cli-visualizations.md`** — CLI `--view` flag designs
5. **`CLAUDE.md`** — Repo rules and paper summaries

### Visualization Plans (by priority)
1. `docs/plans/visualize/two-plane-explorer.md`
2. `docs/plans/visualize/holographic-reconstruction.md`
3. `docs/plans/visualize/tick-receipt-theater.md`
4. `docs/plans/visualize/wormhole-compression.md`
5. `docs/plans/visualize/causal-cone-slicer.md`
6. `docs/plans/visualize/multiway-worldline.md`
7. `docs/plans/visualize/observer-distance-map.md`
8. `docs/plans/visualize/temporal-logic-satisfaction.md`

### Papers (if deep understanding needed)
- `~/git/aion-paper-01/paper/main.tex` (Paper I: static structure)
- `~/git/aion-paper-02/paper/main.tex` (Paper II: dynamics)
- `~/git/aion-paper-03/paper/main.tex` (Paper III: holography)
- `~/git/aion-paper-04/paper/main.tex` (Paper IV: observers)

---

## What's NOT Done Yet

### Planning Phase (COMPLETE)
- [x] Technology stack decisions — See `TECH_DECISIONS.md`
  - Browser: D3.js
  - Terminal: Plain ANSI + boxen/chalk
  - Both targets with parity
- [x] Data API design — CLI commands provide data, renderers consume
- [x] Terminal UI framework — Plain ANSI (not blessed/ink)
- [x] Animation library — None needed (discrete steps in terminal)
- [x] State management — None needed (render once, done)
- [x] Integration with existing git-warp CLI — See `cli-visualizations.md`
- [x] Implementation roadmap — See `VIEWER_ROADMAP.md` (5 milestones, 18 tasks)

### Backend Readiness (varies by visualization)
- **Ready now**: Causal Cone Slicer, Holographic Reconstruction (full backend support)
- **Needs adaptation**: Two-Plane Explorer, Tick Receipt Theater, Multiway Worldline (concepts exist but implementation differs from paper theory)
- **Blocked**: Wormhole Compression (requires v8.0.0 wormhole feature)
- **No backend**: Observer Distance Map, Temporal Logic (Paper IV concepts not implemented)

### Implementation Phase (future)
- [ ] All actual code
- [ ] Tests
- [ ] Documentation

---

## Discussion Topics (Resolved)

1. ~~**Technology choices**~~ — ✅ D3.js (browser) + Plain ANSI (terminal). See `TECH_DECISIONS.md`

2. ~~**Data flow**~~ — ✅ CLI commands compute data, pass to renderers

3. ~~**Unified vs separate tools**~~ — ✅ CLI flags in git-warp (`--view`). See `cli-visualizations.md`

4. **Real-time vs static** — Static snapshot viewing (no live updates planned)

5. ~~**Priority refinement**~~ — ✅ Feasibility-adjusted in `frequency.md`

6. **Missing visualizations** — `diff --view` added. Others TBD based on user feedback

7. **Interaction details** — Defined per-task in `VIEWER_ROADMAP.md`

8. ~~**Export formats**~~ — ✅ SVG and HTML. PNG/PDF out of scope for now

---

## Quick Reference: The Visualization Modes

### 1. Two-Plane Explorer ⚠️ 60%
See WARP state as `U = (G; α, β)`. Browse skeleton, drill into attachments.
*Adapt: Flat properties instead of recursive attachments.*

### 2. Holographic Reconstruction ✅ 95%
Watch `Replay(U₀, P)` reconstruct the interior tick-by-tick.
*Ready: Full backend support via materialize().*

### 3. Tick Receipt Theater ⚠️ 50%
Animate the scheduler: candidates → independence check → accept/reject → batch.
*Adapt: Show CRDT merge outcomes instead of scheduler decisions.*

### 4. Wormhole Compression ❌ 20%
Collapse worldline segments into wormhole edges, expand to see interior.
*Blocked: Requires v8.0.0 wormhole feature (checkpoints only for now).*

### 5. Causal Cone Slicer ✅ 95%
For any value v, show its derivation graph D(v) and slice payload.
*Ready: Full backend support via CommitDagTraversalService.*

### 6. Multiway Worldline ⚠️ 40%
Show the Chronos path through the Aion branching space.
*Adapt: Fork visualization only (no full multiway graph).*

### 7. Observer Distance Map ❌ 15%
Visualize rulial distance D_{τ,m} between observer perspectives.
*Research: Paper IV theory not implemented.*

### 8. Temporal Logic Satisfaction ❌ 10%
Evaluate CTL* formulas like `A G F p_expose` over worldlines.
*Research: Paper IV theory not implemented.*

---

## Git Rules (CRITICAL)

From `CLAUDE.md`:
- **NEVER** use `git commit --amend`
- **NEVER** use `git rebase`
- **NEVER** use force operations

This repo stores graph data as Git commits. Rewriting history destroys data.

---

## Starting Point for Next Session

```bash
cd git-warp-viewer
cat docs/plans/visualize/README.md
cat docs/plans/visualize/frequency.md
```

Then discuss which visualization to refine first, and what technology decisions need to be made.
