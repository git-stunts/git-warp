---
id: DX_artifact-store-stack-diagram
blocked_by: []
blocks: []
feature: browser-viz
---

# Artifact Store Stack Diagram

A single doc showing the full persistence stack:

```text
Domain Service
  ↓ domain objects
Artifact Port (PatchJournalPort, CheckpointStorePort, ...)
  ↓ domain objects
Codec Adapter (CborPatchJournalAdapter, ...)
  ↓ bytes
Raw Git Port (BlobPort, TreePort, CommitPort, RefPort)
  ↓ bytes
GitGraphAdapter
  ↓ git plumbing calls
Git
```

Lives in the design doc for the P5 dissolution cycle. Updated as each
slice lands.

## Source

P5 codec dissolution planning (2026-04-04).
