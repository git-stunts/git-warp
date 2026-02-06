# Handoff: Milestone 1 (FOUNDATION) Implementation

## Quick Context

You are implementing **visualization features for git-warp**, a multi-writer graph database that uses Git commits as storage. The visualization code will be added directly to the git-warp CLI (not this viewer repo — this repo is for planning docs only).

**Your goal**: Implement Milestone 1 (FOUNDATION) — the infrastructure and first two visualizations.

---

## Before You Start

### 1. Create a new branch in the git-warp repo

```bash
cd /Users/james/git/git-stunts/git-warp
git checkout main
git pull
git checkout -b feature/visualization-m1
```

### 2. Read these files (in order)

1. `/Users/james/git/git-stunts/git-warp/CLAUDE.md` — Repo rules (NEVER amend, NEVER rebase)
2. `/Users/james/git/git-stunts/git-warp-viewer/docs/plans/TECH_DECISIONS.md` — Tech stack choices
3. `/Users/james/git/git-stunts/git-warp-viewer/docs/plans/VIEWER_ROADMAP.md` — Full task specs (M1.1-M1.5)
4. `/Users/james/git/git-stunts/git-warp-viewer/docs/plans/visualize/cli-visualizations.md` — ASCII mockups

---

## Technology Decisions (Locked In)

| Decision | Choice |
|----------|--------|
| Browser rendering | D3.js |
| Terminal rendering | Plain ANSI + chalk + boxen + cli-table3 |
| Target | Both terminal and browser (parity) |
| Integration | CLI flags in git-warp (`--view`) |

**Dependencies to add to git-warp/package.json**:
```json
{
  "chalk": "^5.3.0",
  "boxen": "^7.1.1",
  "cli-table3": "^0.6.3",
  "figures": "^6.0.1",
  "string-width": "^7.1.0",
  "wrap-ansi": "^9.0.0",
  "d3": "^7.8.5",
  "jsdom": "^24.0.0",
  "open": "^10.0.0"
}
```

---

## Milestone 1 Tasks

### M1.1: Visualization Module Scaffold
**Create the directory structure and base utilities.**

```text
git-warp/src/visualization/
├── index.js                 # Exports
├── renderers/
│   ├── ascii/
│   │   ├── index.js
│   │   ├── box.js          # Box drawing utilities
│   │   ├── table.js        # Table formatting
│   │   ├── progress.js     # Progress bars
│   │   └── colors.js       # Color palette
│   └── browser/
│       └── index.js        # Placeholder for M5
├── layouts/
│   └── index.js            # Placeholder for M3
└── utils/
    ├── truncate.js         # String truncation
    ├── time.js             # Human-readable times
    └── unicode.js          # Unicode width helpers
```

**Acceptance**: Can import utilities, ESLint passes, basic tests exist.

---

### M1.2: CLI --view Flag Infrastructure
**Add `--view` option to CLI parser.**

File to modify: `/Users/james/git/git-stunts/git-warp/bin/warp-graph.js`

Add global option:
```javascript
.option('--view [mode]', 'Visual output (ascii, browser, svg:FILE, html:FILE)')
```

Add dispatcher logic:
```javascript
if (argv.view) {
  const mode = argv.view === true ? 'ascii' : argv.view;
  // Route to appropriate renderer
}
```

**Acceptance**: `--view` appears in `--help`, flag is parsed correctly.

---

### M1.3: `info --view` Implementation
**First real visualization — show graph overview with writer timelines.**

Expected output:
```text
╔══════════════════════════════════════════════════════════════════╗
║  WARP GRAPHS IN REPOSITORY                                       ║
╠══════════════════════════════════════════════════════════════════╣
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │ 📊 my-graph                                                 │ ║
║  │ Writers: 3 (alice, bob, carol)                             │ ║
║  │   alice ────●────●────●────● (12 patches)                  │ ║
║  │     bob ─────────●────● (5 patches)                        │ ║
║  │   carol ──────────────●────● (7 patches)                   │ ║
║  │ Checkpoint: abc123d (2 min ago) ✓                          │ ║
║  └─────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════╝
```

**Acceptance**: Running `git warp info --view` shows formatted boxes with writer timelines.

---

### M1.4: `check --view` Implementation
**Health dashboard with progress bars and status indicators.**

Expected output:
```text
╔══════════════════════════════════════════════════════════════════╗
║  GRAPH HEALTH: my-graph                                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Cache:      ████████████████░░░░ 80% fresh                     ║
║  Tombstones: ██░░░░░░░░░░░░░░░░░░ 8% (healthy)                  ║
║  Writers:    alice (2m) │ bob (15m) │ carol (1h)                ║
║  Checkpoint: abc123d (2 min ago) ✓                              ║
║  Hooks:      ✓ installed (v2.1.0)                               ║
╠══════════════════════════════════════════════════════════════════╣
║  Overall: ✓ HEALTHY                                              ║
╚══════════════════════════════════════════════════════════════════╝
```

**Acceptance**: Running `git warp check --view` shows health dashboard.

---

### M1.5: ASCII Snapshot Test Infrastructure
**Set up snapshot testing for ASCII output.**

Create: `git-warp/test/visualization/ascii-snapshots/`

Pattern:
```javascript
import { renderInfoView } from '../../src/visualization/renderers/ascii/info.js';
import { stripAnsi } from '../../src/visualization/utils/ansi.js';

test('info view renders correctly', () => {
  const output = renderInfoView(mockGraphData);
  expect(stripAnsi(output)).toMatchSnapshot();
});
```

**Acceptance**: `npm test` includes snapshot tests, CI fails on mismatch.

---

## Implementation Order

```text
M1.1 (scaffold)
    ↓
M1.2 (--view flag)
    ↓
M1.3 (info --view) ←── Start here for first visible output
    ↓
M1.4 (check --view) ←── Parallel with M1.3
    ↓
M1.5 (snapshot tests) ←── After M1.3 and M1.4 have output to test
```

---

## Key Existing Code to Reference

### CLI Entry Point
`/Users/james/git/git-stunts/git-warp/bin/warp-graph.js` (1,377 lines)
- Lines 100-200: Global options setup
- Lines 300-400: `info` command handler
- Lines 500-600: `check` command handler

### Data Sources
- `graph.discoverWriters()` — Get list of writers
- `graph.materialize()` — Get full state
- `graph.getHealth()` — Get health metrics (if exists, or compute from state)

### Existing Patterns
- `--json` flag outputs JSON — `--view` should be mutually exclusive
- Exit codes: 0=OK, 1=USAGE, 2=NOT_FOUND, 3=INTERNAL

---

## Git Rules (CRITICAL)

From CLAUDE.md:
- **NEVER** use `git commit --amend`
- **NEVER** use `git rebase`
- **NEVER** use force operations

Always create new commits. This repo stores graph data as Git commits — rewriting history destroys data.

---

## Definition of Done for M1

- [ ] `src/visualization/` directory created with documented structure
- [ ] `--view` flag added to CLI and appears in `--help`
- [ ] `git warp info --view` produces formatted ASCII output
- [ ] `git warp check --view` produces health dashboard
- [ ] Snapshot tests exist for both views
- [ ] All existing tests still pass
- [ ] ESLint passes
- [ ] PR ready for review

---

## Estimated Effort

| Task | Estimate |
|------|----------|
| M1.1 | 3-4 hours |
| M1.2 | 2-3 hours |
| M1.3 | 4-6 hours |
| M1.4 | 4-6 hours |
| M1.5 | 2-3 hours |
| **Total** | ~2 weeks |

---

## Questions?

If unclear on any requirements, check:
1. `VIEWER_ROADMAP.md` — Full task specifications
2. `cli-visualizations.md` — ASCII mockup designs
3. `TECH_DECISIONS.md` — Technology rationale

Good luck! 🚀
