# Technology Decisions

This document records the technology choices for git-warp visualization implementation.

**Decision Date**: 2026-02-05

---

## Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary Target | Both terminal + browser | Maximum flexibility, works over SSH and in web |
| Graph Library | D3.js | Most flexible, excellent for custom visualizations |
| Terminal UI | Plain ANSI + boxen | Minimal dependencies, direct control |
| Integration | CLI flags in git-warp | Single package, unified experience |

---

## 1. Rendering Target: Both Terminal and Browser

**Decision**: Full parity between terminal (ASCII/ANSI) and browser (HTML/SVG) visualizations.

**Implications**:
- Each visualization needs TWO renderers (terminal + browser)
- Shared data layer that feeds both
- Terminal version works over SSH, in CI/CD, minimal environments
- Browser version provides rich interactivity, animations, export

**Architecture**:
```
┌─────────────────────────────────────────────────┐
│              Visualization Logic                │
│  (data fetching, transformation, layout calc)   │
└─────────────────────┬───────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│ Terminal Render │      │ Browser Render  │
│ (ANSI + boxen)  │      │ (D3.js + SVG)   │
└─────────────────┘      └─────────────────┘
         │                         │
         ▼                         ▼
    stdout/TTY              HTML file / browser
```

**Trade-offs**:
- More development effort (2x renderers)
- Must maintain visual parity
- Terminal has layout constraints (character grid)
- Browser has richer capabilities (hover, zoom, animation)

---

## 2. Graph Rendering: D3.js

**Decision**: Use D3.js for browser-based graph and chart rendering.

**Why D3.js**:
- Most flexible visualization library
- Excellent for custom, non-standard visualizations
- Strong community, extensive examples
- Can generate both interactive SVG and static exports
- Server-side rendering possible via jsdom

**Dependencies** (see `package.json` for current versions):
- `d3` — Core visualization library
- `d3-force` — Force-directed graph layouts
- `d3-hierarchy` — Tree and hierarchical layouts
- `d3-shape` — Shapes for edges, paths, areas

**Use Cases**:
- Force-directed graph layouts (query results, graph explorer)
- Tree layouts (causal cone, dependency graphs)
- Timeline charts (patch history, writer timelines)
- Custom shapes (wormhole edges, state transitions)

**Alternatives Considered**:
- Cytoscape.js: Good for graphs but less flexible for custom viz
- vis.js: Easier but less control
- Mermaid: Too static, no interactivity

---

## 3. Terminal UI: Plain ANSI + Utilities

**Decision**: Use minimal dependencies for terminal rendering.

**Stack** (see `package.json` for current versions):
- `chalk` — ANSI colors and styles
- `boxen` — Box drawing with Unicode
- `cli-table3` — Table formatting
- `figures` — Unicode symbols (checkmarks, arrows, etc.)
- `string-width` — Handle Unicode character widths
- `wrap-ansi` — Text wrapping with ANSI escape codes

**Why NOT Ink or Blessed**:
- Ink: Overkill for our needs, adds React paradigm complexity
- Blessed: Heavy, complex, less maintained
- Plain ANSI: Direct control, minimal dependencies, predictable

**Patterns to Use**:
```javascript
// Box with title
boxen(content, { title: 'Graph Info', padding: 1, borderStyle: 'round' });

// Colored status
chalk.green('✓ PASSED') or chalk.red('✗ FAILED')

// Tables
new Table({ head: ['Node', 'Properties'], style: { head: ['cyan'] } });

// Progress bars
const bar = '█'.repeat(progress) + '░'.repeat(total - progress);
```

**Constraints**:
- 80-column minimum width assumption
- Unicode box drawing (may need fallback for legacy terminals)
- No mouse interaction (keyboard only)
- No true animation (use \r carriage return for progress)

---

## 4. Integration: CLI Flags in git-warp

**Decision**: Add `--view` flags to existing git-warp CLI commands rather than creating a separate package.

**Location**: Changes go in `bin/warp-graph.js`

**Pattern**:
```bash
# Existing command with new flag
git warp query --match 'user:*' --view

# View modes
git warp info --view              # ASCII in terminal
git warp info --view=browser      # Open in browser
git warp info --view=svg:out.svg  # Write SVG file
git warp info --view=html:out.html # Write HTML file
```

**Implementation**:
```javascript
// In warp-graph.js command handler
if (argv.view) {
  const renderer = resolveRenderer(argv.view); // 'ascii' | 'browser' | 'svg:path' | 'html:path'
  const vizData = prepareVisualizationData(result);
  await renderer.render(vizData);
} else {
  // Existing text/JSON output
}
```

**New Commands to Add**:
- `git warp view` — Interactive graph browser
- `git warp replay` — Animated reconstruction
- `git warp slice` — Causal cone visualization
- `git warp diff` — State comparison

**Why NOT Separate Package**:
- Unified experience (one install, one CLI)
- Shared dependencies (already has chalk, etc.)
- Easier discovery (--help shows view options)
- Simpler release process

**Trade-offs**:
- Increases git-warp bundle size
- Visualization code in main repo (could extract later)
- Must coordinate releases

---

## 5. Additional Technical Notes

### Browser Serving Strategy

For `--view=browser`, we need to serve HTML. Options:

**Option A: Temporary file + open** (Recommended)
```javascript
const html = renderToHTML(data);
const tmpFile = path.join(os.tmpdir(), `warp-view-${Date.now()}.html`);
fs.writeFileSync(tmpFile, html);
open(tmpFile); // Uses system browser
```

**Option B: Local server**
```javascript
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(renderToHTML(data));
});
server.listen(0, () => open(`http://localhost:${server.address().port}`));
```

Recommend Option A for simplicity. Option B if we need live updates.

### SVG Server-Side Rendering

For `--view=svg:FILE`, use D3 with jsdom:
```javascript
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const svg = d3.select(dom.window.document.body)
  .append('svg')
  .attr('xmlns', 'http://www.w3.org/2000/svg');
// ... render ...
fs.writeFileSync(outPath, dom.window.document.body.innerHTML);
```

### State Management

No framework needed. Use simple patterns:
- Command handlers compute visualization data
- Renderers are pure functions: `(data) => output`
- No global state
- No reactivity needed (render once, done)

### Testing Strategy

- **Unit tests**: Data transformation functions
- **Snapshot tests**: ASCII output for terminal renderer
- **Visual regression**: SVG output comparison
- **Integration tests**: Full CLI command with --view flag

---

## 6. File Structure

```
git-warp/
├── bin/
│   └── warp-graph.js              # CLI entry (add --view handling)
├── src/
│   ├── domain/                     # Existing domain code
│   └── visualization/              # NEW: visualization code
│       ├── renderers/
│       │   ├── ascii/              # Terminal renderers
│       │   │   ├── info.js
│       │   │   ├── query.js
│       │   │   ├── path.js
│       │   │   └── ...
│       │   └── browser/            # Browser renderers
│       │       ├── info.js
│       │       ├── query.js
│       │       └── ...
│       ├── layouts/                # Graph layout algorithms
│       │   ├── force.js
│       │   ├── tree.js
│       │   └── timeline.js
│       ├── components/             # Reusable viz components
│       │   ├── ascii/
│       │   │   ├── box.js
│       │   │   ├── table.js
│       │   │   └── graph.js
│       │   └── browser/
│       │       ├── tooltip.js
│       │       ├── legend.js
│       │       └── controls.js
│       └── index.js                # Exports
└── test/
    └── visualization/              # Visualization tests
        ├── ascii-snapshots/
        └── svg-snapshots/
```

---

## 7. Dependencies Summary

See `package.json` for authoritative versions. Key dependencies by category:

**Production — Browser rendering**:
- `d3` — Core visualization library
- `jsdom` — Server-side DOM for SVG rendering
- `open` — Open browser from CLI

**Production — Terminal rendering**:
- `chalk` — ANSI colors and styles
- `boxen` — Box drawing with Unicode
- `cli-table3` — Table formatting
- `figures` — Unicode symbols
- `string-width` — Handle Unicode character widths
- `wrap-ansi` — Text wrapping with ANSI escape codes

**Dev**:
- `pixelmatch` — Visual regression testing

---

## Decision Log

| Date | Decision | Made By | Notes |
|------|----------|---------|-------|
| 2026-02-05 | Both terminal + browser | User | Maximum flexibility |
| 2026-02-05 | D3.js for graphs | User | Most flexible option |
| 2026-02-05 | Plain ANSI + boxen | User | Minimal dependencies |
| 2026-02-05 | CLI flags in git-warp | User | Unified experience |
