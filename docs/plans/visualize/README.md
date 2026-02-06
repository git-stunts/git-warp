# WARP Visualization Plans

This directory contains detailed plans for visualizing WARP graph state, evolution, and provenance.

## Implementation Readiness

The following table summarizes current feasibility based on v7.x backend capabilities:

| Visualization | Feasibility | Score | Status |
|---------------|-------------|-------|--------|
| Causal Cone Slicer | ✅ READY | 95% | Full backend support |
| Holographic Reconstruction | ✅ READY | 95% | Full backend support |
| Two-Plane Explorer | ⚠️ ADAPTED | 60% | Flat model only (no recursion) |
| Tick Receipt Theater | ⚠️ ADAPTED | 50% | CRDT outcomes only (no scheduler) |
| Multiway Worldline | ⚠️ PARTIAL | 40% | Fork visualization only |
| Wormhole Compression | ❌ BLOCKED | 20% | Requires HG/WORM/1 (v8.0.0) |
| Observer Distance Map | ❌ NOT IMPL | 15% | Paper IV theory only |
| Temporal Logic | ❌ NOT IMPL | 10% | Paper IV theory only |

## Visualizations by Priority

### Tier 1: Core (Daily Use) — Ready to Build
| Visualization | Feasibility | Description | Paper |
|--------------|-------------|-------------|-------|
| [Causal Cone Slicer](causal-cone-slicer.md) | ✅ 95% | Show derivation graph D(v) for values | III |
| [Holographic Reconstruction](holographic-reconstruction.md) | ✅ 95% | Replay boundary (U₀, P) to interior | III |
| [Two-Plane Explorer](two-plane-explorer.md) | ⚠️ 60% | View graph + properties (flat, not recursive) | I |

### Tier 2: Workflow (Regular Use) — Partial Support
| Visualization | Feasibility | Description | Paper |
|--------------|-------------|-------------|-------|
| [Tick Receipt Theater](tick-receipt-theater.md) | ⚠️ 50% | Show CRDT merge outcomes (not scheduler) | II |
| [Multiway Worldline](multiway-worldline.md) | ⚠️ 40% | Fork & merge visualization | IV |

### Tier 3: Blocked or Research
| Visualization | Feasibility | Description | Paper |
|--------------|-------------|-------------|-------|
| [Wormhole Compression](wormhole-compression.md) | ❌ 20% | Blocked on HG/WORM/1 | III |
| [Observer Distance Map](observer-distance-map.md) | ❌ 15% | Paper IV theory only | IV |
| [Temporal Logic Satisfaction](temporal-logic-satisfaction.md) | ❌ 10% | Paper IV theory only | IV |

## CLI Integration

The git-warp CLI can be extended with `--view` flags to produce inline visualizations:

| Command | `--view` Output | Feasibility |
|---------|-----------------|-------------|
| `git warp info --view` | Writer timelines, graph overview | ✅ Ready |
| `git warp query --view` | Subgraph visualization | ✅ Ready |
| `git warp path --view` | Path diagram with hops | ✅ Ready |
| `git warp history --view` | Patch timeline with ops | ✅ Ready |
| `git warp check --view` | Health dashboard | ✅ Ready |
| `git warp replay --view` | Animated reconstruction | ✅ Ready |
| `git warp slice --view` | Causal cone diagram | ✅ Ready |

See **[cli-visualizations.md](cli-visualizations.md)** for detailed designs and ASCII mockups.

## Meta-Documentation
| Document | Description |
|----------|-------------|
| [frequency.md](frequency.md) | Ranking by expected usage frequency |
| [cli-visualizations.md](cli-visualizations.md) | CLI `--view` flag designs |

## Key Concepts Visualized

The papers describe theoretical concepts that are partially implemented in the v7.x codebase.
Visualizations marked ✅ have full backend support. Those marked ⚠️ show adapted versions
of the paper concepts using available primitives. Those marked ❌ require future work.

```
Paper I:  WARP Graphs (static structure)
          └── Two-Plane Explorer ⚠️ (flat graph + properties, not recursive attachments)

Paper II: Ticks & Determinism (dynamics)
          └── Tick Receipt Theater ⚠️ (CRDT merge outcomes, not formal scheduler)

Paper III: Holography & Provenance
          ├── Holographic Reconstruction ✅ (boundary → interior replay)
          ├── Causal Cone Slicer ✅ (D(v) derivation graphs via patch chain)
          └── Wormhole Compression ❌ (requires HG/WORM/1 in v8.0.0)

Paper IV: Observer Geometry
          ├── Multiway Worldline ⚠️ (fork visualization, not full Aion space)
          ├── Observer Distance Map ❌ (theory only, no implementation)
          └── Temporal Logic Satisfaction ❌ (theory only, no implementation)
```

**Note:** The AION Foundations Series papers describe a complete theoretical framework.
The current v7.x implementation provides practical CRDT-based graph storage with
multi-writer support, which enables some visualizations while others await future versions.

## Rendering Targets

Each visualization supports multiple rendering modes:

### GUI (SVG/Canvas)
- Full interactive experience
- Animations and transitions
- Hover/click interactions

### Terminal (ASCII)
- Works in any terminal
- CI/CD friendly
- SSH remote inspection

### Static Export
- PNG/SVG for documentation
- PDF for reports
- Markdown for inline embedding

## Common UI Patterns

### Navigation
- Breadcrumb trails for hierarchical exploration
- Zoom/pan for large graphs
- Keyboard shortcuts (arrows, enter, escape)

### Color Semantics
| Color | Meaning |
|-------|---------|
| Blue | Initial/boundary states |
| Green | Accepted/satisfied/success |
| Red | Rejected/violated/failure |
| Orange | Warning/pending/in-progress |
| Purple | Wormholes/compression/metadata |
| Cyan | Semantic/derived information |

### Animation Timing
- Step-through mode for analysis
- Continuous playback for overview
- Speed control (0.5x, 1x, 2x, 4x)

## Implementation Notes

### Data Loading
- Lazy loading for large graphs
- Streaming for replay
- Caching for repeated access

### Performance
- Progressive rendering for large structures
- Aggregation/clustering for complex multiway graphs
- WebGL for dense visualizations

### Accessibility
- Keyboard navigation for all interactions
- High contrast mode
- Screen reader support for state descriptions
