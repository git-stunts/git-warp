# Explicit Conflict Surfacing

## What must remain true?

When concurrent writers produce conflicting operations, the system
must surface the conflict through observable CRDT semantics (add-wins
for OR-Set, deterministic tiebreak for LWW) rather than silently
discarding one side. No user intent is erased without a recoverable
trace.

## Why does it matter?

OG-4, Theorem 15 proves that explicit conflict surfacing is
geometrically closer to the intent-preserving observer than silent
last-write-wins. In the language of observer geometry: a system that
surfaces conflicts maintains closer proximity to `O_intent` because
both sides of a collision are recoverable. A silent LWW policy erases
the "loser's" intent, incurring a mandatory distortion floor that no
translator can eliminate.

In git-warp, this means: the OR-Set's add-wins semantics preserves
both concurrent adds even when a concurrent remove exists (unless the
remove observed the specific add dot). LWW registers break ties
deterministically (Lamport timestamp > writer ID > patch SHA), but
both values remain in the patch chain for provenance queries. The
`ConflictAnalyzerService` exists specifically to detect and report
when concurrent operations would have conflicted under weaker
semantics.

## Paper grounding

- **OG-4, Theorem 15** (Explicit Conflict is Geometrically Closer to
  Intent): `Dist(O_conf, O_intent) < Dist(O_lww, O_intent)` under
  any intent-loss-sensitive metric.
- **OG-4, Definition 14** (The Intent Observer): records original,
  un-transported user-intent patches as authored at their respective
  frontiers.
- **Paper II, Definition 6.1** (Tick receipt): records both accepted
  and rejected matches, preserving the conflict structure.

## How the codebase upholds it

- `ORSet` implements observed-remove semantics: a remove only kills
  dots it has observed, not future adds. Concurrent add + remove
  resolves to "add wins" -- the add is preserved.
- `LWW` breaks ties deterministically but both competing values exist
  as patches in the commit chain. A provenance query can recover the
  "losing" value.
- `TickReceipt` (in `src/domain/services/`) records operation types
  including both `NodePropSet` and `EdgePropSet`, capturing the full
  conflict structure.
- `ConflictAnalyzerService` detects semantic conflicts across writers.
- No operation in `JoinReducer` silently drops data. Every tombstone
  carries observed dots; every property set carries an EventId.

## How do you check?

1. **Add-wins test**: Writer A adds node X. Writer B concurrently
   removes node X (having observed A's add). Writer C concurrently
   adds node X (without observing B's remove). After materialization,
   node X must exist (C's add wins over B's remove because B did not
   observe C's dot). This is covered in OR-Set unit tests.

2. **LWW recovery test**: Writer A sets `color=red` at Lamport 5.
   Writer B sets `color=blue` at Lamport 5 but with a lower writer
   ID. After materialization, `color=blue` wins (or `red` wins --
   depends on writer ID ordering). But `patchesFor()` returns both
   patches, making the "losing" value recoverable.

3. **Static check**: `JoinReducer` must never call `delete` on an
   OR-Set entry without providing observed dots:
   ```bash
   grep -n "\.remove\|\.delete" src/domain/services/JoinReducer.js
   ```
   Every call must pass an observed-dots argument.
