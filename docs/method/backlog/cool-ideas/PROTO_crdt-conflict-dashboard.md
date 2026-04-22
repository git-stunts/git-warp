---
id: PROTO_crdt-conflict-dashboard
blocked_by: []
blocks: []
---

# CRDT conflict resolution dashboard

Multi-writer CRDTs resolve conflicts silently by design. That's the
feature — no coordination needed. But "silently" means operators
can't see when writers disagree, how often, or about what.

Imagine a dashboard that shows:
- **Conflict rate** over time (superseded ops / total ops per minute)
- **Writer divergence** (how far behind each writer's frontier is)
- **LWW winners** — which writer's values are winning property
  conflicts, and whether it's one writer dominating
- **Tombstone accumulation** — are removes piling up faster than
  GC can compact them?
- **Causal depth** — how deep is the version vector? Deep vectors
  suggest long-running partitions.

The data source: TickReceipt outcomes (OpApplied, OpSuperseded,
OpRedundant). The effect pipeline provides the emission channel.
The dashboard could be:
- CLI: `git warp doctor --conflict-report`
- Browser: websocket-fed real-time graph in the inspector
- Prometheus: metrics exported from the effect pipeline sink

The insight: CRDTs don't eliminate conflicts — they resolve them
deterministically. But deterministic resolution without visibility
is a black box. This dashboard makes the resolution visible.
