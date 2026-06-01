---
id: SPEC_docs-materialize-frontdoor-drift
blocked_by: []
blocks: []
feature: docs-dx
release_home: v17.0.0
---

# Public docs still teach the materialization frontdoor

**Effort:** M

## What's Wrong

The README and Getting Started guide still show public materialization
before reads. That contradicts the current v17 direction: public reads
should be Optics and Readings over causal worldlines, not
materializing graphs.

Observed examples:

- `README.md` quick start calls `graph.materialize.materialize({})`
- `docs/GETTING_STARTED.md` tells users to fold patches into
  materialized state before creating a worldline
- `docs/API_REFERENCE.md` still includes materialization-era examples
  and error guidance

## Suggested Fix

Add docs-code contract tests that reject public snippets containing
`graph.materialize`, `graph.materialize.materialize`, or
`_materializeGraph`. Replace examples with the blessed v17 reading API
and add a dedicated readings/optics guide.
