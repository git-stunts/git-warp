---
id: TS_publish-pipeline
blocks:
  - TS_ssts-conformance-suite
blocked_by:
  - API_kill-warpruntime
  - TS_infrastructure-adapters
  - TS_cli-viz-scripts
---

# Publish pipeline for v17.0.0

- Generate .d.ts declarations via `tsc --emitDeclarationOnly`
- Verify npm and JSR publish with .ts source
- Update release runbook
- Tag v17.0.0

Phase 6 of cycle 0013.
