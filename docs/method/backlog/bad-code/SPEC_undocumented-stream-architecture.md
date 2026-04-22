---
id: SPEC_undocumented-stream-architecture
blocked_by: []
blocks: []
feature: docs-dx
release_home: v17.0.0
---

# WarpStream architecture has no user-facing documentation

**Effort:** S

WarpStream, Transform, Sink, and the stream pipeline (PR #77) are a
major architectural layer with a design doc at
docs/design/0008-stream-architecture/ but no mention in:
- docs/GUIDE.md
- docs/ADVANCED_GUIDE.md
- docs/ARCHITECTURE.md
- docs/API_REFERENCE.md

The controller decomposition (9 controllers) and the 3 new ports
(PatchJournalPort, CheckpointStorePort, IndexStorePort) are also
undocumented outside CHANGELOG.

## Suggested fix

Add sections to the appropriate docs:
- ARCHITECTURE.md: stream layer, controller layer, new ports
- GUIDE.md: basic WarpStream usage
- ADVANCED_GUIDE.md: custom transforms, sinks, effect emission
