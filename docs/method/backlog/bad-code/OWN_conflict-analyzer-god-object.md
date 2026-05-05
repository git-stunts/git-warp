---
id: OWN_conflict-analyzer-god-object
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v21.0.0
---

# ConflictAnalyzerService is a god object (2582 LOC)

**Effort:** L

## What's Wrong

`ConflictAnalyzerService.js` is the largest file in the codebase at
2582 lines. It mixes conflict classification, evidence collection,
receipt replay, target matching, and report formatting -- all in a
single class. Multiple distinct reasons to change, violating the
single-responsibility principle.

## Suggested Fix

- Extract `EvidenceCollector` -- gathers raw conflict evidence from
  patches and receipts.
- Extract `ReceiptReplayer` -- replays tick receipts to reconstruct
  conflict timelines.
- Extract `ConflictReporter` -- formats analysis results into reports.
- `ConflictAnalyzerService` becomes a thin orchestrator that delegates
  to these collaborators.
