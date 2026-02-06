# CLI Visualization Integration

This document proposes `--view` flag integration for the git-warp CLI, enabling inline visualizations for each command.

## Overview

Each `git warp` command currently supports `--json` for machine-readable output. We propose adding `--view` (or `--show`) flags that produce visual representations of the data, either as:
- **ASCII art** in the terminal (default)
- **SVG output** to file (`--view=svg:output.svg`)
- **HTML output** to file (`--view=html:output.html`)
- **Open in browser** (`--view=browser`)

## Global View Options

```bash
--view              # ASCII visualization in terminal (default)
--view=ascii        # Explicit ASCII mode
--view=svg:FILE     # Write SVG to file
--view=html:FILE    # Write HTML to file
--view=browser      # Open interactive view in browser
--view=json         # Alias for --json (structured data)
```

---

## Command Visualizations

### 1. `git warp info --view`

**Purpose**: Overview of all graphs in the repository

**ASCII Visualization**:
```
╔══════════════════════════════════════════════════════════════════╗
║  WARP GRAPHS IN REPOSITORY                                       ║
║  /Users/james/git/my-project                                     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │ 📊 my-graph                                                 │ ║
║  │ ───────────────────────────────────────────────────────────│ ║
║  │ Writers: 3 (alice, bob, carol)                             │ ║
║  │                                                             │ ║
║  │   alice ────●────●────●────●────● (12 patches)             │ ║
║  │     bob ─────────●────●────● (5 patches)                   │ ║
║  │   carol ──────────────●────●────●────● (7 patches)         │ ║
║  │                                                             │ ║
║  │ Checkpoint: abc123d (2 min ago)                            │ ║
║  │ Coverage:   def456a (all writers merged)                   │ ║
║  │ State:      ✓ fresh (23 nodes, 41 edges)                   │ ║
║  └─────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │ 📊 other-graph                                              │ ║
║  │ ───────────────────────────────────────────────────────────│ ║
║  │ Writers: 1 (cli)                                           │ ║
║  │                                                             │ ║
║  │     cli ────●────●────● (3 patches)                        │ ║
║  │                                                             │ ║
║  │ Checkpoint: (none)                                         │ ║
║  │ State:      ⚠ no checkpoint                                │ ║
║  └─────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- All graphs in repo with writer timelines
- Patch counts per writer
- Checkpoint/coverage status
- State freshness indicator

**Feasibility**: ✅ HIGH — All data available from existing `info` command

---

### 2. `git warp query --view`

**Purpose**: Visualize query results as a graph

**ASCII Visualization** (for `git warp query --match 'user:*' --outgoing follows`):
```
╔══════════════════════════════════════════════════════════════════╗
║  QUERY RESULTS: user:* → follows                                 ║
║  Graph: social | State: abc123d | Nodes: 4                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║                    ┌─────────────┐                               ║
║                    │ user:alice  │                               ║
║                    │ role: admin │                               ║
║                    └──────┬──────┘                               ║
║                           │ follows                              ║
║              ┌────────────┼────────────┐                         ║
║              ▼            ▼            ▼                         ║
║       ┌───────────┐ ┌───────────┐ ┌───────────┐                 ║
║       │ user:bob  │ │user:carol │ │ user:dave │                 ║
║       │ role: eng │ │ role: eng │ │ role: mgr │                 ║
║       └───────────┘ └───────────┘ └───────────┘                 ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  Legend: [node] ──label──▶ [target]                             ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Matched nodes as boxes with properties
- Edge relationships with labels
- Traversal direction indicated by arrows

**Interactive mode** (`--view=browser`):
- Force-directed graph layout
- Click nodes to see full properties
- Filter/search within results
- Export subgraph

**Feasibility**: ✅ HIGH — Query results already structured, just needs rendering

---

### 3. `git warp path --view`

**Purpose**: Visualize the shortest path between nodes

**ASCII Visualization** (for `git warp path --from user:alice --to user:eve`):
```
╔══════════════════════════════════════════════════════════════════╗
║  PATH: user:alice → user:eve                                     ║
║  Graph: social | Length: 3 hops | Status: ✓ FOUND               ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ┌────────────┐  manages   ┌────────────┐  follows  ┌──────────┐║
║  │user:alice  │───────────▶│ user:bob   │──────────▶│user:carol│║
║  │ dept: eng  │            │ dept: eng  │           │dept: sales│║
║  └────────────┘            └────────────┘           └─────┬─────┘║
║                                                           │      ║
║                                                    knows  │      ║
║                                                           ▼      ║
║                                                    ┌───────────┐ ║
║                                                    │ user:eve  │ ║
║                                                    │ dept: hr  │ ║
║                                                    └───────────┘ ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  Path: alice ─manages→ bob ─follows→ carol ─knows→ eve          ║
╚══════════════════════════════════════════════════════════════════╝
```

**Alternative: Linear view** (for simpler paths):
```
╔══════════════════════════════════════════════════════════════════╗
║  PATH: user:alice → user:eve (3 hops)                           ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  [user:alice] ──manages──▶ [user:bob] ──follows──▶ [user:carol] ║
║       │                                                 │        ║
║       │                                          ──knows──▶      ║
║       │                                                 │        ║
║       │                                          [user:eve]      ║
║       │                                                          ║
║       └──────────────── 3 hops ─────────────────────────┘        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Source and target nodes highlighted
- Each hop with edge label
- Node properties along the path
- Total path length

**Feasibility**: ✅ HIGH — Path data already returned by command

---

### 4. `git warp history --view`

**Purpose**: Visualize patch history as a timeline

**ASCII Visualization** (for `git warp --writer alice history`):
```
╔══════════════════════════════════════════════════════════════════╗
║  PATCH HISTORY: writer alice                                     ║
║  Graph: my-graph | Patches: 12 | Span: 3 days                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Lamport  SHA        Ops  Time           Operations              ║
║  ───────  ─────────  ───  ─────────────  ────────────────────── ║
║                                                                  ║
║     1     abc123d     3   Jan 15 09:00   +node:alice +node:bob   ║
║     │                                    +edge:alice→bob         ║
║     │                                                            ║
║     2     def456a     2   Jan 15 09:15   +prop:alice.name        ║
║     │                                    +prop:bob.name          ║
║     │                                                            ║
║     3     789bcd1     1   Jan 15 10:30   +edge:bob→carol         ║
║     │                                                            ║
║     ⋮     (6 patches hidden, use --all to show)                  ║
║     │                                                            ║
║    11     aaa111b     4   Jan 17 14:20   +node:eve ~prop:bob.role║
║     │                                    +edge:alice→eve -node:x ║
║     │                                                            ║
║    12     bbb222c     2   Jan 17 16:45   ~prop:alice.status      ║
║     ●                                    ~prop:eve.dept          ║
║                                                                  ║
║  Legend: + add   ~ modify   - remove                            ║
╚══════════════════════════════════════════════════════════════════╝
```

**Multi-writer view** (`git warp history --view --all-writers`):
```
╔══════════════════════════════════════════════════════════════════╗
║  PATCH HISTORY: all writers                                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Time         alice          bob            carol                ║
║  ───────────  ─────────────  ─────────────  ─────────────        ║
║  Jan 15 09:00 ●(L1, 3 ops)                                       ║
║  Jan 15 09:10              ●(L1, 2 ops)                          ║
║  Jan 15 09:15 ●(L2, 2 ops)                                       ║
║  Jan 15 09:20              ●(L2, 1 op)                           ║
║  Jan 15 10:00                             ●(L1, 4 ops)           ║
║  Jan 15 10:30 ●(L3, 1 op)                                        ║
║       ⋮            ⋮              ⋮              ⋮               ║
║  Jan 17 16:45 ●(L12, 2 ops)                                      ║
║                                                                  ║
║  Total:       12 patches     8 patches      5 patches            ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Lamport timestamp progression
- Operation summaries per patch
- Time-based ordering
- Multi-writer interleaving

**Feasibility**: ✅ HIGH — History data available, needs formatting

---

### 5. `git warp check --view`

**Purpose**: Visual health dashboard for the graph

**ASCII Visualization**:
```
╔══════════════════════════════════════════════════════════════════╗
║  GRAPH HEALTH: my-graph                                          ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ┌─ STATE ──────────────────────────────────────────────────────┐║
║  │ Cache:     ████████████████████░░░░ 80% fresh                │║
║  │ Patches:   12 since checkpoint                               │║
║  │ Tombstones: ██░░░░░░░░░░░░░░░░░░░░ 8% (healthy)              │║
║  └──────────────────────────────────────────────────────────────┘║
║                                                                  ║
║  ┌─ WRITERS ────────────────────────────────────────────────────┐║
║  │ alice   ●────●────●────●────●────● tip: abc123d (2m ago)    │║
║  │ bob     ●────●────●────● tip: def456a (15m ago)              │║
║  │ carol   ●────●────●────●────●────●────● tip: 789bcd1 (1h)   │║
║  └──────────────────────────────────────────────────────────────┘║
║                                                                  ║
║  ┌─ CHECKPOINT ─────────────────────────────────────────────────┐║
║  │ SHA:    abc123def456789...                                   │║
║  │ Age:    2 minutes                                            │║
║  │ Status: ✓ up to date                                         │║
║  └──────────────────────────────────────────────────────────────┘║
║                                                                  ║
║  ┌─ COVERAGE ───────────────────────────────────────────────────┐║
║  │ alice: ✓ merged    bob: ✓ merged    carol: ⚠ 2 behind       │║
║  └──────────────────────────────────────────────────────────────┘║
║                                                                  ║
║  ┌─ HOOKS ──────────────────────────────────────────────────────┐║
║  │ post-merge: ✓ installed (v2.1.0, current)                    │║
║  └──────────────────────────────────────────────────────────────┘║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  Overall: ✓ HEALTHY                                              ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Cache freshness with progress bar
- Tombstone ratio with health indicator
- Writer timelines with recency
- Checkpoint age and status
- Coverage merge status
- Hook installation status

**Feasibility**: ✅ HIGH — All metrics available from `check` command

---

### 6. `git warp materialize --view`

**Purpose**: Show materialization progress and result summary

**ASCII Visualization** (during materialization):
```
╔══════════════════════════════════════════════════════════════════╗
║  MATERIALIZING: my-graph                                         ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Loading patches...                                              ║
║  ████████████████████████████░░░░░░░░░░ 70% (84/120 patches)    ║
║                                                                  ║
║  Writers processed:                                              ║
║    ✓ alice (12 patches)                                         ║
║    ✓ bob (8 patches)                                            ║
║    ▶ carol (64/100 patches)                                     ║
║                                                                  ║
║  Current state:                                                  ║
║    Nodes: 156  Edges: 289  Properties: 412                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**After completion**:
```
╔══════════════════════════════════════════════════════════════════╗
║  MATERIALIZED: my-graph                                          ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ┌─ RESULT ─────────────────────────────────────────────────────┐║
║  │                                                               │║
║  │  Nodes      ████████████████████ 234                         │║
║  │  Edges      ██████████████████████████████ 456               │║
║  │  Properties ████████████████████████████████████████ 789     │║
║  │                                                               │║
║  │  Patches applied: 120 (from 3 writers)                       │║
║  │  Conflicts resolved: 23 (LWW)                                │║
║  │  Tombstones: 18 (7.7%)                                       │║
║  │                                                               │║
║  └──────────────────────────────────────────────────────────────┘║
║                                                                  ║
║  Checkpoint: def789abc... (created just now)                     ║
║  State hash: 0x3a7f2c9d1b...                                    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Real-time progress during materialization
- Per-writer patch loading status
- Final statistics (nodes, edges, properties)
- Conflict resolution summary
- New checkpoint SHA

**Feasibility**: ✅ MEDIUM — Needs progress callback hooks in materialize()

---

## Advanced Visualization Commands

These commands would be NEW additions to the CLI, specifically for visualization:

### 7. `git warp view`

**Purpose**: General-purpose graph visualization (combines query + view)

```bash
# View entire graph
git warp view

# View subgraph matching pattern
git warp view --match 'user:*'

# View with specific layout
git warp view --layout force|tree|radial|hierarchy

# Open in browser
git warp view --browser
```

**ASCII Visualization**:
```
╔══════════════════════════════════════════════════════════════════╗
║  GRAPH VIEW: my-graph                                            ║
║  Nodes: 23 | Edges: 41 | Layout: force-directed                 ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║              ┌───────┐                                           ║
║              │ org:A │                                           ║
║              └───┬───┘                                           ║
║         ┌────────┼────────┐                                      ║
║         ▼        ▼        ▼                                      ║
║     ┌───────┐┌───────┐┌───────┐                                 ║
║     │dept:X ││dept:Y ││dept:Z │                                 ║
║     └───┬───┘└───┬───┘└───┬───┘                                 ║
║         │        │        │                                      ║
║    ┌────┴────┐ ┌─┴─┐ ┌────┴────┐                                ║
║    ▼    ▼    ▼ ▼   ▼ ▼    ▼    ▼                                ║
║  ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐                           ║
║  │u:a││u:b││u:c││u:d││u:e││u:f││u:g│                           ║
║  └───┘└───┘└───┘└───┘└───┘└───┘└───┘                           ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  [↑↓←→] Navigate  [Enter] Inspect  [/] Search  [q] Quit         ║
╚══════════════════════════════════════════════════════════════════╝
```

**Feasibility**: ✅ HIGH — Builds on query infrastructure

---

### 8. `git warp replay --view`

**Purpose**: Animated reconstruction of state from patches (Holographic Reconstruction)

```bash
# Replay all patches with visualization
git warp replay --view

# Replay specific range
git warp replay --from abc123 --to def456 --view

# Step-by-step mode
git warp replay --view --step
```

**ASCII Visualization**:
```
╔══════════════════════════════════════════════════════════════════╗
║  REPLAY: my-graph                                                ║
║  Tick 47/120 | Writer: alice | Lamport: 23                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  BOUNDARY (U₀, P)              INTERIOR (reconstructed)          ║
║  ─────────────────             ────────────────────────          ║
║  Initial: 0x3a7f...            Current state:                    ║
║  Patches: 120                                                    ║
║                                  ┌─────┐   ┌─────┐               ║
║  ┌────────────────┐              │node1│───│node2│               ║
║  │ Patch 47       │              └──┬──┘   └──┬──┘               ║
║  │ +node:user:eve │    ═══▶         │         │                  ║
║  │ +edge:alice→eve│              ┌──┴──┐   ┌──┴──┐               ║
║  │ ~prop:bob.role │              │node3│   │*eve*│ ← NEW         ║
║  └────────────────┘              └─────┘   └─────┘               ║
║                                                                  ║
║  Progress: ████████████████░░░░░░░░░░░░░░░░ 39%                 ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  [Space] Play/Pause  [←→] Step  [r] Reset  [q] Quit             ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Boundary data on left (initial state + payload)
- Reconstructed interior on right
- Current patch being applied
- Operation highlights (added nodes glow)
- Progress bar

**Feasibility**: ✅ HIGH — Backend fully supports replay via materialize()

---

### 9. `git warp slice --view`

**Purpose**: Visualize causal cone for a target value

```bash
# Show causal cone for specific node
git warp slice user:alice --view

# Show slice payload
git warp slice user:alice --view --show-patches
```

**ASCII Visualization**:
```
╔══════════════════════════════════════════════════════════════════╗
║  CAUSAL CONE: user:alice                                         ║
║  Cone size: 12 patches (vs 120 total) — 90% reduction           ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  PROVENANCE GRAPH                    SLICE PAYLOAD               ║
║  ─────────────────                   ─────────────               ║
║                                                                  ║
║       ○ v₁        ○ v₂               Required patches:           ║
║        ╲         ╱  (outside)                                    ║
║         ╲       ╱                    ┌────────────────────┐      ║
║   ┌──────●─────●──────┐              │ μ₂: create alice   │      ║
║   │    dep₁   dep₂    │              │ μ₅: set alice.name │      ║
║   │      ╲     ╱      │              │ μ₈: set alice.role │      ║
║   │       ╲   ╱       │ D(v)         │ μ₁₂: link to org   │      ║
║   │        ╲ ╱        │              └────────────────────┘      ║
║   │         ◉ ←───────┼── TARGET                                 ║
║   │     user:alice    │              Skipped: 108 patches        ║
║   └───────────────────┘                                          ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  [Tab] Select target  [Enter] Replay slice  [e] Export          ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Causal cone highlighted in provenance graph
- Outside-cone values faded
- Slice payload (required patches only)
- Efficiency metrics

**Feasibility**: ✅ HIGH — `materializeSlice()` API ready

---

### 10. `git warp diff --view`

**Purpose**: Visualize differences between two states

```bash
# Diff between two commits
git warp diff abc123 def456 --view

# Diff current state vs checkpoint
git warp diff --checkpoint --view
```

**ASCII Visualization**:
```
╔══════════════════════════════════════════════════════════════════╗
║  DIFF: abc123 → def456                                           ║
║  +5 nodes  -2 nodes  ~12 properties  +8 edges  -3 edges         ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ADDED NODES                      REMOVED NODES                  ║
║  ───────────                      ─────────────                  ║
║  + user:eve                       - temp:session1                ║
║  + user:frank                     - temp:session2                ║
║  + dept:marketing                                                ║
║  + project:alpha                                                 ║
║  + task:123                                                      ║
║                                                                  ║
║  MODIFIED PROPERTIES                                             ║
║  ───────────────────                                             ║
║  ~ user:alice.role: "engineer" → "senior_engineer"              ║
║  ~ user:bob.status: "active" → "on_leave"                       ║
║  ~ dept:eng.headcount: 12 → 15                                  ║
║  ... (9 more)                                                    ║
║                                                                  ║
║  ADDED EDGES                      REMOVED EDGES                  ║
║  ───────────                      ─────────────                  ║
║  + alice ─manages→ eve            - bob ─member_of→ temp_team   ║
║  + eve ─member_of→ marketing      - carol ─assigned→ old_task   ║
║  ... (6 more)                     - dave ─reports_to→ ex_mgr    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**What it shows**:
- Summary of changes at top
- Added/removed/modified items grouped
- Property value changes with before/after

**Feasibility**: ✅ MEDIUM — Needs StateDiff service integration

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 weeks)
Commands with data already available, just need ASCII rendering:

| Command | Effort | Notes |
|---------|--------|-------|
| `info --view` | 2 days | Writer timelines, status badges |
| `check --view` | 2 days | Health dashboard with progress bars |
| `history --view` | 2 days | Timeline with operation summaries |
| `path --view` | 1 day | Linear path rendering |

### Phase 2: Query Visualization (2-3 weeks)
Interactive graph rendering:

| Command | Effort | Notes |
|---------|--------|-------|
| `query --view` | 1 week | Force-directed subgraph |
| `view` (new) | 1 week | General graph visualization |

### Phase 3: Advanced Visualizations (3-4 weeks)
Paper III concepts:

| Command | Effort | Notes |
|---------|--------|-------|
| `replay --view` | 1.5 weeks | Animated reconstruction |
| `slice --view` | 1 week | Causal cone visualization |
| `diff --view` | 1 week | State comparison |
| `materialize --view` | 0.5 week | Progress + result summary |

### Phase 4: Browser Integration (2-3 weeks)
HTML/SVG output and `--view=browser`:

| Feature | Effort | Notes |
|---------|--------|-------|
| SVG export | 1 week | Static graph images |
| HTML export | 1 week | Interactive D3.js views |
| Browser launch | 0.5 week | `open` command integration |

---

## Technical Considerations

### ASCII Rendering Library Options
- **blessed** / **blessed-contrib**: Full TUI framework with charts
- **ink**: React-based terminal UI
- **cli-table3**: Simple table formatting
- **boxen**: Box drawing
- **chalk**: Colors and styling
- Custom: Direct ANSI escape codes

### SVG Generation
- **D3.js**: Server-side with jsdom
- **dagre-d3**: Automatic graph layout
- **viz.js**: Graphviz in JS

### Performance
- Lazy rendering for large graphs
- Pagination for long lists
- Streaming for progress updates
- Caching of layout calculations

### Accessibility
- High contrast mode
- Screen reader support via aria labels
- Keyboard navigation throughout

---

## Connection to Standalone Visualizations

The CLI `--view` flags produce simplified versions of the full visualizations:

| CLI Command | Full Visualization | Relationship |
|-------------|-------------------|--------------|
| `info --view` | — | CLI-only overview |
| `query --view` | Two-Plane Explorer | Subset of query results |
| `path --view` | — | CLI-only path view |
| `history --view` | Tick Receipt Theater | Simplified timeline |
| `check --view` | — | CLI-only health dashboard |
| `materialize --view` | — | CLI-only progress |
| `view` | Two-Plane Explorer | Full graph browser |
| `replay --view` | Holographic Reconstruction | Animated replay |
| `slice --view` | Causal Cone Slicer | Cone visualization |
| `diff --view` | — | CLI-only diff view |

The `--view=browser` flag can launch the full standalone visualization tools when available.
