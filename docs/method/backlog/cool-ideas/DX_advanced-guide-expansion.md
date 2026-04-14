# Expand ADVANCED_GUIDE.md with trust, performance, and checkpoints

**Audit ref:** DQ01-L-02

At 219 lines, ADVANCED_GUIDE.md is the thinnest of the narrative docs.
It covers patch anatomy and replay convergence well, but substrate
topics cross-referenced elsewhere (trust model, performance tuning,
checkpoint strategy) are missing.

## Proposal

Expand with:
- Trust model details (modes: off / log-only / enforce)
- Performance guidance (bitmap index tuning, materialization budgets)
- Checkpoint tuning (frequency, GC policies)
- Encryption at rest (encrypted blob store configuration)
