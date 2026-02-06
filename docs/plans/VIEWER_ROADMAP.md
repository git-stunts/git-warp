# Viewer Implementation Roadmap

This roadmap defines the implementation plan for git-warp visualization features, organized into milestones with detailed task specifications.

**Tech Stack**: D3.js (browser) + Plain ANSI/boxen (terminal) + CLI flags in git-warp
**Target**: Both terminal and browser parity

---

## Milestones Overview

| Milestone | Name | Focus | Tasks | Est. Effort |
|-----------|------|-------|-------|-------------|
| **M1** | FOUNDATION | Infrastructure + first view | 5 | 2 weeks |
| **M2** | QUICK WINS | Simple CLI visualizations | 4 | 1.5 weeks |
| **M3** | GRAPH VIEWS | Query and path visualization | 3 | 2 weeks |
| **M4** | HOLOGRAM | Paper III visualizations | 3 | 3 weeks |
| **M5** | POLISH | Browser integration + export | 3 | 2 weeks |

---

# Milestone 1: FOUNDATION

**Goal**: Establish visualization infrastructure and deliver one complete end-to-end visualization.

**Theme**: "First light" — get pixels on screen with proper architecture.

---

## Task M1.1: Visualization Module Scaffold

### User Story
> As a developer, I want a well-organized visualization module structure so that I can add new visualizations consistently.

### Requirements
- [ ] Create `src/visualization/` directory structure in git-warp repo
- [ ] Set up renderer abstraction (ASCII vs browser)
- [ ] Create shared utilities (color palettes, Unicode helpers)
- [ ] Add visualization dependencies to package.json
- [ ] Create index.js with exports

### Acceptance Criteria
- [ ] `src/visualization/` exists with documented structure
- [ ] Can import `{ AsciiRenderer, BrowserRenderer }` from module
- [ ] Dependencies installed and working (chalk, boxen, d3, jsdom)
- [ ] ESLint passes on new code
- [ ] README in visualization folder explains architecture

### Scope
**In Scope**:
- Directory structure creation
- Base renderer classes/interfaces
- Utility functions for colors, Unicode, box drawing
- Package.json dependency additions

**Out of Scope**:
- Actual visualizations (that's M1.3+)
- CLI flag parsing (that's M1.2)
- Browser serving logic (that's M5)

### Test Plan

**Golden Path**:
```javascript
import { createAsciiBox, createTable } from './visualization';
const box = createAsciiBox('Hello', { title: 'Test' });
assert(box.includes('┌') && box.includes('Hello'));
```

**Failure Cases**:
- Missing dependencies → clear error message
- Invalid color name → fallback to default
- Non-TTY environment → disable colors gracefully

**Edge Cases**:
- Very long strings (truncation)
- Unicode in content (width calculation)
- Empty content

**Fuzz/Stress**:
- Random Unicode strings
- Extremely long inputs (10KB+)
- Rapid repeated calls

### Definition of Done
- [ ] Code merged to main branch
- [ ] All tests passing
- [ ] Documentation complete
- [ ] No new ESLint warnings
- [ ] Peer review approved

### Blockers
- **Blocked By**: None (first task)
- **Blocks**: M1.2, M1.3, all subsequent tasks

---

## Task M1.2: CLI --view Flag Infrastructure

### User Story
> As a CLI user, I want to add `--view` to any command so that I can see visual output instead of text/JSON.

### Requirements
- [ ] Add `--view` global option to CLI parser
- [ ] Support view modes: `--view` (ASCII), `--view=ascii`, `--view=json`
- [ ] Create dispatcher that routes to appropriate renderer
- [ ] Handle TTY detection (disable view on non-TTY unless forced)
- [ ] Add `--view` to --help output for all commands

### Acceptance Criteria
- [ ] `git warp info --view` produces ASCII output
- [ ] `git warp info --view=ascii` same as above
- [ ] `git warp info --view=json` same as `--json`
- [ ] Non-TTY pipes fall back to text unless `--view` explicit
- [ ] `--help` shows view options

### Scope
**In Scope**:
- CLI argument parsing for --view
- TTY detection logic
- Dispatcher function skeleton
- Help text updates

**Out of Scope**:
- Actual visualization rendering (M1.3+)
- Browser/SVG modes (M5)
- New commands like `view`, `replay` (M4)

### Test Plan

**Golden Path**:
```bash
git warp info --view  # Shows ASCII visualization
git warp info         # Shows text (existing behavior)
echo | git warp info --view  # Still shows ASCII (explicit flag)
```

**Failure Cases**:
- `--view=invalid` → error with valid options list
- `--view` with `--json` → error (mutually exclusive)

**Edge Cases**:
- `--view` on command that doesn't support it yet → "not implemented" message
- CI environment (no TTY) with `--view`

**Fuzz/Stress**:
- N/A for CLI parsing

### Definition of Done
- [ ] Code merged to main branch
- [ ] BATS CLI tests added
- [ ] Documentation updated
- [ ] Backwards compatible (existing commands unchanged without --view)

### Blockers
- **Blocked By**: M1.1 (needs renderer infrastructure)
- **Blocks**: M1.3, M2.*, M3.*, M4.*

---

## Task M1.3: `info --view` Implementation

### User Story
> As a CLI user, I want `git warp info --view` to show me a visual overview of all graphs in my repository with writer timelines.

### Requirements
- [ ] Show each graph as a card/box
- [ ] Display writer count and list
- [ ] Show writer patch timelines (ASCII dots/lines)
- [ ] Display checkpoint status with age
- [ ] Display coverage status
- [ ] Color-code health status (green=good, yellow=warn, red=bad)

### Acceptance Criteria
- [ ] Running `git warp info --view` shows formatted boxes
- [ ] Each graph shows: name, writers, checkpoint SHA, coverage SHA
- [ ] Writer timelines show relative patch counts
- [ ] Status indicators use color (with fallback for no-color)
- [ ] Output fits in 80-column terminal
- [ ] Empty repo shows helpful message

### Scope
**In Scope**:
- ASCII box rendering for graph cards
- Writer timeline visualization (simple ASCII)
- Status coloring
- 80-column layout

**Out of Scope**:
- Browser rendering (M5)
- Interactive elements
- Detailed patch information (that's `history --view`)

### Test Plan

**Golden Path**:
```bash
# Setup: repo with 2 graphs, 3 writers
git warp info --view
# Expected: Two boxes, each with writer lines, checkpoint info
```

**Failure Cases**:
- No graphs in repo → "No WARP graphs found" message
- Corrupted graph → show error inline, continue with others

**Edge Cases**:
- Graph with 0 patches
- Graph with 100+ writers (truncate list)
- Very long graph name (truncate)
- No checkpoint yet

**Fuzz/Stress**:
- 50 graphs in one repo
- 1000 patches per writer
- Unicode in graph names

### Definition of Done
- [ ] ASCII output matches mockup in cli-visualizations.md
- [ ] Tests cover all acceptance criteria
- [ ] Works on macOS, Linux (CI)
- [ ] Performance: <500ms for typical repo

### Blockers
- **Blocked By**: M1.1, M1.2
- **Blocks**: None (parallel with M1.4, M1.5)

---

## Task M1.4: `check --view` Implementation

### User Story
> As a CLI user, I want `git warp check --view` to show me a visual health dashboard for my graph.

### Requirements
- [ ] Show cache freshness as progress bar
- [ ] Show tombstone ratio as progress bar with health indicator
- [ ] Show writer list with latest patch age
- [ ] Show checkpoint status with age
- [ ] Show coverage merge status per writer
- [ ] Show hook installation status
- [ ] Overall health summary (HEALTHY / WARNING / UNHEALTHY)

### Acceptance Criteria
- [ ] Progress bars render correctly at various percentages
- [ ] Colors indicate health (green <30%, yellow 30-70%, red >70% for tombstones)
- [ ] Writer ages shown in human-readable format (2m ago, 1h ago)
- [ ] Hook status shows version and currency
- [ ] Overall status prominently displayed

### Scope
**In Scope**:
- Progress bar ASCII rendering
- Health status calculations
- Human-readable time formatting
- Section-based layout (State, Writers, Checkpoint, Coverage, Hooks)

**Out of Scope**:
- Browser rendering (M5)
- Historical health trends
- Remediation suggestions

### Test Plan

**Golden Path**:
```bash
git warp check --view
# Shows dashboard with all sections, overall HEALTHY
```

**Failure Cases**:
- Graph not materialized → show "not materialized" status
- Missing checkpoint → show "none" with warning color

**Edge Cases**:
- 0% and 100% progress bars
- Checkpoint from 30 days ago
- No writers (empty graph)

**Fuzz/Stress**:
- Very high tombstone ratio (99%)
- 100 writers

### Definition of Done
- [ ] ASCII output matches mockup
- [ ] All health indicators tested
- [ ] Performance: <200ms

### Blockers
- **Blocked By**: M1.1, M1.2
- **Blocks**: None

---

## Task M1.5: ASCII Rendering Test Infrastructure

### User Story
> As a developer, I want snapshot tests for ASCII output so that I can catch visual regressions.

### Requirements
- [ ] Set up snapshot test pattern for ASCII output
- [ ] Create fixtures for common scenarios
- [ ] Strip ANSI codes for snapshot comparison (optional color-aware mode)
- [ ] Document how to update snapshots

### Acceptance Criteria
- [ ] `npm test` runs ASCII snapshot tests
- [ ] Snapshots stored in `test/visualization/ascii-snapshots/`
- [ ] Clear instructions for updating snapshots
- [ ] CI fails on snapshot mismatch

### Scope
**In Scope**:
- Snapshot test utilities
- Initial snapshots for M1.3, M1.4
- ANSI stripping utility
- Documentation

**Out of Scope**:
- Browser/SVG snapshot tests (M5)
- Visual diff tooling

### Test Plan

**Golden Path**:
```javascript
const output = renderInfoView(mockData);
expect(output).toMatchSnapshot('info-view-basic');
```

**Failure Cases**:
- Snapshot doesn't exist → create new one (with warning)
- Snapshot mismatch → fail with diff

**Edge Cases**:
- Snapshot with/without ANSI codes
- Platform-specific line endings

### Definition of Done
- [ ] Snapshot infrastructure working
- [ ] At least 5 snapshots for M1.3, M1.4
- [ ] CI integration complete
- [ ] Documentation in test/README.md

### Blockers
- **Blocked By**: M1.3, M1.4 (needs something to snapshot)
- **Blocks**: M2.*, M3.*, M4.* (all need snapshot tests)

---

# Milestone 2: QUICK WINS

**Goal**: Implement simple visualizations for remaining CLI commands.

**Theme**: "Low-hanging fruit" — commands where data is already structured.

---

## Task M2.1: `history --view` Implementation

### User Story
> As a CLI user, I want `git warp history --view` to show me a visual timeline of patches for a writer.

### Requirements
- [ ] Show patches in chronological order
- [ ] Display Lamport timestamp, SHA (truncated), op count
- [ ] Show operation summaries (+node, ~prop, -edge)
- [ ] Support `--all-writers` for multi-writer timeline
- [ ] Paginate long histories (show most recent, option for all)

### Acceptance Criteria
- [ ] Single writer shows vertical timeline
- [ ] Multi-writer shows parallel columns
- [ ] Operations color-coded (green=add, yellow=modify, red=remove)
- [ ] Handles 1000+ patches with pagination

### Scope
**In Scope**:
- Timeline ASCII rendering
- Operation parsing and summarization
- Pagination controls
- Multi-writer layout

**Out of Scope**:
- Patch diff details
- Interactive navigation
- Browser rendering (M5)

### Test Plan

**Golden Path**:
```bash
git warp --writer alice history --view
# Shows timeline of alice's patches
```

**Failure Cases**:
- Unknown writer → error message
- Writer with 0 patches → "No patches" message

**Edge Cases**:
- Single patch
- 10,000 patches (pagination)
- Patch with 100 operations (truncate summary)

**Fuzz/Stress**:
- Rapid patch creation while viewing

### Definition of Done
- [ ] ASCII output matches mockup
- [ ] Pagination working
- [ ] Multi-writer view working
- [ ] Snapshot tests added

### Blockers
- **Blocked By**: M1.5 (test infrastructure)
- **Blocks**: None

---

## Task M2.2: `path --view` Implementation

### User Story
> As a CLI user, I want `git warp path --view` to show me a visual diagram of the shortest path between two nodes.

### Requirements
- [ ] Show path as connected nodes with labeled edges
- [ ] Display node properties inline or on hover equivalent
- [ ] Handle both found and not-found cases
- [ ] Show path length prominently

### Acceptance Criteria
- [ ] Found path shows node chain with arrows
- [ ] Edge labels displayed on arrows
- [ ] Not-found shows clear message
- [ ] Long paths wrap appropriately

### Scope
**In Scope**:
- Linear path ASCII rendering
- Edge label display
- Node property display
- Not-found handling

**Out of Scope**:
- Alternative paths
- Graph context (surrounding nodes)
- Browser rendering (M5)

### Test Plan

**Golden Path**:
```bash
git warp path --from user:alice --to user:bob --view
# Shows: [alice] --manages--> [carol] --reports_to--> [bob]
```

**Failure Cases**:
- No path exists → "No path found" with helpful message
- From/to same node → "Already at destination"

**Edge Cases**:
- Path of length 1 (direct edge)
- Path of length 20 (wrapping)
- Self-loop in path

**Fuzz/Stress**:
- N/A

### Definition of Done
- [ ] ASCII output matches mockup
- [ ] All path scenarios tested
- [ ] Snapshot tests added

### Blockers
- **Blocked By**: M1.5
- **Blocks**: None

---

## Task M2.3: `materialize --view` Implementation

### User Story
> As a CLI user, I want `git warp materialize --view` to show me progress and results visually.

### Requirements
- [ ] Show progress bar during materialization
- [ ] Show per-writer patch loading status
- [ ] Show final statistics (nodes, edges, properties)
- [ ] Show new checkpoint SHA

### Acceptance Criteria
- [ ] Progress updates in real-time (or simulated)
- [ ] Final summary shows bar charts for counts
- [ ] Conflict count displayed if any
- [ ] Works for multiple graphs

### Scope
**In Scope**:
- Progress bar with percentage
- Summary statistics display
- Multi-graph handling

**Out of Scope**:
- Streaming progress (may use polling)
- Conflict details
- Browser rendering

### Test Plan

**Golden Path**:
```bash
git warp materialize --view
# Shows progress, then summary
```

**Failure Cases**:
- Materialization error → show error, partial results if any

**Edge Cases**:
- Empty graph (0 patches)
- Already materialized (no-op)

**Fuzz/Stress**:
- 10,000 patches

### Definition of Done
- [ ] Progress and summary display working
- [ ] Tested with various graph sizes
- [ ] Snapshot tests for summary

### Blockers
- **Blocked By**: M1.5
- **Blocks**: None

---

## Task M2.4: Documentation for View Flags

### User Story
> As a CLI user, I want clear documentation for all --view options so that I know what visualizations are available.

### Requirements
- [ ] Update GUIDE.md with --view documentation
- [ ] Add examples for each command
- [ ] Document view modes (ascii, browser, svg, html)
- [ ] Add screenshots/examples of output

### Acceptance Criteria
- [ ] Each command's --view documented
- [ ] Examples are copy-pasteable
- [ ] Output examples shown (can be ASCII art in markdown)

### Scope
**In Scope**:
- GUIDE.md updates
- Example commands
- Output samples

**Out of Scope**:
- Tutorial/walkthrough
- Video documentation

### Test Plan
- Documentation review by another person
- All examples tested manually

### Definition of Done
- [ ] GUIDE.md updated
- [ ] PR reviewed for clarity
- [ ] Examples verified working

### Blockers
- **Blocked By**: M2.1, M2.2, M2.3 (need working features to document)
- **Blocks**: None

---

# Milestone 3: GRAPH VIEWS

**Goal**: Implement graph-based visualizations that show node/edge structures.

**Theme**: "Seeing the graph" — the core value proposition.

---

## Task M3.1: `query --view` Implementation

### User Story
> As a CLI user, I want `git warp query --view` to show me query results as a visual graph.

### Requirements
- [ ] Render matched nodes as boxes
- [ ] Show edges between matched nodes
- [ ] Display node properties (truncated)
- [ ] Support different layouts (list, tree, force-directed-ish)
- [ ] Handle large result sets with pagination/truncation

### Acceptance Criteria
- [ ] Query results render as connected graph
- [ ] Node IDs and key properties visible
- [ ] Edges labeled
- [ ] >100 nodes shows "and N more..." truncation
- [ ] Empty results shows helpful message

### Scope
**In Scope**:
- ASCII graph rendering (simplified force-directed)
- Node box rendering with properties
- Edge rendering with labels
- Result truncation

**Out of Scope**:
- True force-directed layout (approximate in ASCII)
- Interactive filtering
- Browser rendering (M5)

### Test Plan

**Golden Path**:
```bash
git warp query --match 'user:*' --outgoing follows --view
# Shows users and their follow relationships
```

**Failure Cases**:
- No matches → "No nodes match query"
- Invalid pattern → existing error handling

**Edge Cases**:
- Single node, no edges
- Disconnected subgraphs
- Cycles in graph

**Fuzz/Stress**:
- 1000 node result set

### Definition of Done
- [ ] ASCII graph rendering working
- [ ] Layout algorithm documented
- [ ] Snapshot tests for various topologies
- [ ] Performance: <1s for 100 nodes

### Blockers
- **Blocked By**: M1.5, M2.* (builds on simpler views)
- **Blocks**: M3.2

---

## Task M3.2: `view` Command (New)

### User Story
> As a CLI user, I want a `git warp view` command to browse my graph interactively.

### Requirements
- [ ] Show entire graph (or subset with --match)
- [ ] Keyboard navigation between nodes
- [ ] Show node details on selection
- [ ] Show connected edges
- [ ] Exit with 'q'

### Acceptance Criteria
- [ ] Interactive mode with cursor
- [ ] Arrow keys navigate between nodes
- [ ] Enter shows node details
- [ ] Escape goes back
- [ ] 'q' exits

### Scope
**In Scope**:
- Interactive terminal UI
- Keyboard navigation
- Node detail view
- Basic graph layout

**Out of Scope**:
- Mouse support
- Search within view
- Browser version (M5)

### Test Plan

**Golden Path**:
```bash
git warp view
# Interactive graph browser opens
# Press arrows to navigate, Enter to inspect, q to quit
```

**Failure Cases**:
- Empty graph → show message
- Non-TTY → error "requires interactive terminal"

**Edge Cases**:
- Single node
- 10,000 nodes (viewport + scrolling)

**Fuzz/Stress**:
- Rapid key presses

### Definition of Done
- [ ] Interactive navigation working
- [ ] All keybindings documented
- [ ] Tested on macOS and Linux terminals

### Blockers
- **Blocked By**: M3.1 (uses same graph rendering)
- **Blocks**: None

---

## Task M3.3: Graph Layout Algorithm

### User Story
> As a developer, I want a reusable graph layout algorithm for ASCII rendering.

### Requirements
- [ ] Support hierarchical/tree layout
- [ ] Support simple force-directed approximation
- [ ] Handle various graph sizes
- [ ] Respect terminal width constraints
- [ ] Document algorithm and complexity

### Acceptance Criteria
- [ ] Layouts are deterministic (same input → same output)
- [ ] No overlapping nodes
- [ ] Edges don't cross nodes (best effort)
- [ ] Works for DAGs and cyclic graphs

### Scope
**In Scope**:
- Tree layout (for DAGs)
- Grid/flow layout (for general graphs)
- Layout options API

**Out of Scope**:
- True force-directed (too complex for ASCII)
- 3D layouts

### Test Plan

**Golden Path**:
```javascript
const layout = computeLayout(nodes, edges, { type: 'tree', width: 80 });
// Returns { nodes: [{id, x, y}], edges: [{from, to, path}] }
```

**Failure Cases**:
- Disconnected graph → layout each component
- Cycle → break cycle for tree layout

**Edge Cases**:
- Single node
- Linear chain
- Complete graph (K_n)

**Fuzz/Stress**:
- Random graphs up to 1000 nodes

### Definition of Done
- [ ] Algorithm implemented and documented
- [ ] Unit tests for various topologies
- [ ] Performance benchmarks recorded

### Blockers
- **Blocked By**: None (can develop in parallel)
- **Blocks**: M3.1, M3.2, M4.1, M4.2

---

# Milestone 4: HOLOGRAM

**Goal**: Implement Paper III visualizations — the crown jewels.

**Theme**: "Computational holography" — boundary reconstructs interior.

---

## Task M4.1: `slice --view` Command (New)

### User Story
> As a CLI user, I want `git warp slice <nodeId> --view` to show me the causal cone for a value.

### Requirements
- [ ] Compute causal cone D(v) for target node
- [ ] Render provenance graph with cone highlighted
- [ ] Show outside-cone nodes as faded
- [ ] Display slice payload (required patches)
- [ ] Show efficiency metrics (full vs slice)

### Acceptance Criteria
- [ ] Target node prominently marked
- [ ] Cone nodes highlighted (different color/style)
- [ ] Non-cone nodes faded
- [ ] Patch list shows only required patches
- [ ] Efficiency percentage displayed

### Scope
**In Scope**:
- Causal cone computation (via existing materializeSlice)
- Provenance graph rendering
- Cone highlighting
- Slice payload display

**Out of Scope**:
- Multi-value selection (future enhancement)
- Slice replay animation (that's M4.2)
- Browser rendering (M5)

### Test Plan

**Golden Path**:
```bash
git warp slice user:alice --view
# Shows provenance graph with alice's causal cone highlighted
```

**Failure Cases**:
- Node doesn't exist → error message
- Node has no provenance (initial state) → show empty cone

**Edge Cases**:
- Node depends on everything (100% cone)
- Node depends on nothing (single patch)
- Circular dependencies (shouldn't happen but handle gracefully)

**Fuzz/Stress**:
- Node with 500-patch cone

### Definition of Done
- [ ] ASCII cone visualization working
- [ ] Matches mockup in causal-cone-slicer.md
- [ ] Uses materializeSlice API correctly
- [ ] Snapshot tests added

### Blockers
- **Blocked By**: M3.3 (layout algorithm)
- **Blocks**: M4.2

---

## Task M4.2: `replay --view` Command (New)

### User Story
> As a CLI user, I want `git warp replay --view` to show me animated reconstruction from boundary to interior.

### Requirements
- [ ] Show boundary data (initial state + payload summary)
- [ ] Animate patch application one at a time
- [ ] Show state changes (added/modified/removed)
- [ ] Support step-through mode (pause between patches)
- [ ] Show progress and hash verification

### Acceptance Criteria
- [ ] Initial state displayed
- [ ] Each patch shows what it changes
- [ ] Changes highlighted (green add, yellow modify, red remove)
- [ ] Progress bar shows tick N/total
- [ ] Final state hash verified against checkpoint

### Scope
**In Scope**:
- Step-by-step replay visualization
- Change highlighting
- Progress display
- Hash verification display

**Out of Scope**:
- Smooth animation (use discrete steps)
- Parallel replay
- Browser rendering (M5)

### Test Plan

**Golden Path**:
```bash
git warp replay --view
# Shows animated reconstruction
# Press space to pause, arrows to step, q to quit
```

**Failure Cases**:
- No patches → show initial state only
- Corrupted patch → show error, stop replay

**Edge Cases**:
- Single patch
- 1000 patches (need fast-forward option)

**Fuzz/Stress**:
- Replay with rapid stepping

### Definition of Done
- [ ] Step-through replay working
- [ ] Matches mockup in holographic-reconstruction.md
- [ ] Hash verification displayed
- [ ] Keyboard controls documented

### Blockers
- **Blocked By**: M4.1, M3.3
- **Blocks**: None

---

## Task M4.3: Receipt Inspector Enhancement

### User Story
> As a CLI user, I want enhanced `history --view` to show tick receipt details (applied/superseded/redundant).

### Requirements
- [ ] Show per-operation outcomes from TickReceipt
- [ ] Color-code: green=applied, yellow=redundant, red=superseded
- [ ] Show supersession reason (which write won)
- [ ] Support filtering by outcome type

### Acceptance Criteria
- [ ] Operation outcomes visible in history view
- [ ] Can filter `--view --filter=superseded` to see only conflicts
- [ ] Reason displayed for superseded ops

### Scope
**In Scope**:
- TickReceipt integration into history view
- Outcome coloring
- Filtering by outcome
- Reason display

**Out of Scope**:
- Full "Theater" animation (Paper II not fully implemented)
- Independence matrix (no footprint data)

### Test Plan

**Golden Path**:
```bash
git warp --writer alice history --view
# Shows patches with operation outcomes
```

**Failure Cases**:
- No receipts available → show operations without outcomes

**Edge Cases**:
- All operations applied (no conflicts)
- All operations superseded (major conflict)

**Fuzz/Stress**:
- N/A

### Definition of Done
- [ ] Receipt data displayed in history view
- [ ] Filtering working
- [ ] Snapshot tests updated

### Blockers
- **Blocked By**: M2.1 (history --view)
- **Blocks**: None

---

# Milestone 5: POLISH

**Goal**: Browser rendering, export, and production readiness.

**Theme**: "Ship it" — ready for users.

---

## Task M5.1: Browser Rendering Infrastructure

### User Story
> As a CLI user, I want `--view=browser` to open visualizations in my web browser.

### Requirements
- [ ] Generate self-contained HTML with embedded D3
- [ ] Write to temp file and open with system browser
- [ ] Include all visualization data inline
- [ ] Style consistently with ASCII version

### Acceptance Criteria
- [ ] `git warp info --view=browser` opens browser
- [ ] HTML is self-contained (no external dependencies)
- [ ] Visualization renders correctly in Chrome, Firefox, Safari
- [ ] Temp file cleaned up after reasonable time

### Scope
**In Scope**:
- HTML generation with embedded D3
- System browser opening
- Basic styling

**Out of Scope**:
- Local server mode
- Live updates
- Authentication

### Test Plan

**Golden Path**:
```bash
git warp info --view=browser
# Browser opens with visual dashboard
```

**Failure Cases**:
- No browser available → error with instructions
- Can't write temp file → error

**Edge Cases**:
- Headless environment (CI)
- WSL (Windows browser from Linux)

**Fuzz/Stress**:
- Large data sets (performance in browser)

### Definition of Done
- [ ] Browser opening works on macOS, Linux
- [ ] HTML renders correctly
- [ ] Documented in GUIDE.md

### Blockers
- **Blocked By**: M4.* (need visualizations to render)
- **Blocks**: M5.2

---

## Task M5.2: SVG/HTML Export

### User Story
> As a CLI user, I want `--view=svg:FILE` and `--view=html:FILE` to export visualizations to files.

### Requirements
- [ ] SVG export for all visualizations
- [ ] HTML export with interactivity preserved
- [ ] Proper file writing with error handling
- [ ] Consistent styling

### Acceptance Criteria
- [ ] `git warp info --view=svg:info.svg` creates valid SVG
- [ ] `git warp info --view=html:info.html` creates valid HTML
- [ ] Files can be opened in browser/viewer
- [ ] Overwrite prompts if file exists (or --force)

### Scope
**In Scope**:
- SVG generation (server-side D3 + jsdom)
- HTML export
- File writing
- Overwrite handling

**Out of Scope**:
- PDF export
- PNG export (would need headless browser)

### Test Plan

**Golden Path**:
```bash
git warp query --match '*' --view=svg:graph.svg
# Creates graph.svg
open graph.svg  # Renders correctly
```

**Failure Cases**:
- Can't write to path → clear error
- Invalid path → clear error

**Edge Cases**:
- Path with spaces
- Relative vs absolute paths

**Fuzz/Stress**:
- Very large SVG (10MB+)

### Definition of Done
- [ ] SVG export working for all views
- [ ] HTML export working for all views
- [ ] File handling robust
- [ ] Documented

### Blockers
- **Blocked By**: M5.1
- **Blocks**: M5.3

---

## Task M5.3: Visual Regression Testing

### User Story
> As a developer, I want visual regression tests for browser/SVG output.

### Requirements
- [ ] SVG snapshot comparison
- [ ] Tolerance for minor rendering differences
- [ ] CI integration
- [ ] Easy snapshot updating

### Acceptance Criteria
- [ ] SVG snapshots stored in repo
- [ ] CI fails on visual regression
- [ ] Clear diff output on failure
- [ ] Documentation for updating snapshots

### Scope
**In Scope**:
- SVG snapshot testing
- Pixel-level comparison with tolerance
- CI integration

**Out of Scope**:
- Interactive testing
- Cross-browser testing

### Test Plan

**Golden Path**:
```bash
npm test
# Includes SVG snapshot comparisons
```

**Failure Cases**:
- Snapshot mismatch → fail with diff image

**Edge Cases**:
- Platform rendering differences (fonts)

### Definition of Done
- [ ] Visual regression tests in CI
- [ ] All views have SVG snapshots
- [ ] Documentation complete

### Blockers
- **Blocked By**: M5.2
- **Blocks**: None (final task)

---

# Dependency Graph

```text
M1.1 ─────┬──▶ M1.2 ──┬──▶ M1.3 ──┬──▶ M1.5
          │          │          │
          │          ├──▶ M1.4 ──┤
          │          │          │
          │          │          ▼
          │          │    ┌─────────────────────────────────┐
          │          │    │           MILESTONE 2           │
          │          │    │  M2.1  M2.2  M2.3  (parallel)   │
          │          │    │         │                       │
          │          │    │         ▼                       │
          │          │    │       M2.4                      │
          │          │    └─────────────────────────────────┘
          │          │                   │
          │          │                   ▼
          │          │    ┌─────────────────────────────────┐
          │          └───▶│           MILESTONE 3           │
          │               │  M3.3 ──▶ M3.1 ──▶ M3.2        │
          │               └─────────────────────────────────┘
          │                              │
          │                              ▼
          │               ┌─────────────────────────────────┐
          │               │           MILESTONE 4           │
          │               │  M4.1 ──▶ M4.2                  │
          │               │  M4.3 (parallel, needs M2.1)    │
          │               └─────────────────────────────────┘
          │                              │
          │                              ▼
          │               ┌─────────────────────────────────┐
          └──────────────▶│           MILESTONE 5           │
                          │  M5.1 ──▶ M5.2 ──▶ M5.3        │
                          └─────────────────────────────────┘
```

---

# Timeline Estimate

| Milestone | Duration | Cumulative |
|-----------|----------|------------|
| M1: FOUNDATION | 2 weeks | Week 2 |
| M2: QUICK WINS | 1.5 weeks | Week 3.5 |
| M3: GRAPH VIEWS | 2 weeks | Week 5.5 |
| M4: HOLOGRAM | 3 weeks | Week 8.5 |
| M5: POLISH | 2 weeks | Week 10.5 |

**Total: ~10-11 weeks** for full implementation.

---

# Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ASCII layout complexity | High | Medium | Start with simple layouts, iterate |
| D3 server-side issues | Medium | Low | jsdom well-tested, fallback to simpler rendering |
| Performance on large graphs | Medium | Medium | Pagination, truncation, lazy loading |
| Terminal compatibility | Low | Medium | Test on common terminals, provide fallbacks |
| Scope creep | High | High | Strict scope boundaries per task |

---

# Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test coverage | >80% | Jest coverage report |
| ASCII snapshot count | >30 | Count in snapshot directory |
| Commands with --view | 8 | Count in CLI |
| Documentation pages | 5+ | Count in docs/ |
| Performance (info --view) | <500ms | Benchmark |
| Performance (query --view, 100 nodes) | <1s | Benchmark |
