# WARP doctrine/runtime teaching alignment

This audit applies the
[Doctrine/runtime Alignment Ratchet](../DOCTRINE_RUNTIME_ALIGNMENT.md) to the
main teaching docs. It is the readable checklist for issue
[#556](https://github.com/git-stunts/git-warp/issues/556).

The purpose is not to weaken WARP doctrine. The purpose is to stop public docs
from teaching target nouns as if they are already complete runtime law.

## Teaching surface matrix

| Surface | Runtime posture | Required pointer |
|---|---|---|
| `README.md` | First-use docs teach worldline-first application work as current, observer and coordinate nouns as transition, and strands, braids, and suffix admission as target or advanced substrate work. | [GLOSSARY.md](../GLOSSARY.md) |
| `docs/GUIDE.md` | Builder patterns use shipped and transition APIs while warning that strand examples are the current pinned-overlay implementation, not live holographic strands. | [Doctrine/runtime Alignment Ratchet](../DOCTRINE_RUNTIME_ALIGNMENT.md) |
| `docs/ADVANCED_GUIDE.md` | Engine-room docs may describe substrate mechanics, but must mark pinned-base strands, braid support, and sync transport as implementation posture rather than final WARP doctrine. | [WARP_DRIFT.md](WARP_DRIFT.md) |
| `docs/API_REFERENCE.md` | Exhaustive API docs describe shipped or transition surfaces and point target doctrine back to the ratchet. | [Doctrine/runtime Alignment Ratchet](../DOCTRINE_RUNTIME_ALIGNMENT.md) |
| `docs/CONCEPTUAL_OVERVIEW.md` | Conceptual docs may explain WARP doctrine, but must distinguish current runtime behavior from target doctrine. | [GLOSSARY.md](../GLOSSARY.md) |

## Active reconciliation hills

These issues own the currently visible doctrine/runtime gaps:

- [#560 Live holographic strands](https://github.com/git-stunts/git-warp/issues/560)
  owns the move from pinned-base overlays to basis-relative strand realization.
- [#561 Observer plans and reading envelopes](https://github.com/git-stunts/git-warp/issues/561)
  owns the move from snapshot/filter observers to plan-backed reading envelopes.
- [#564 Witnessed suffix admission shells](https://github.com/git-stunts/git-warp/issues/564)
  owns the move from frontier-plus-patches sync to witnessed suffix admission.
- [#558 Bounded support rules for query surfaces](https://github.com/git-stunts/git-warp/issues/558),
  [#559 Causal indexes for sliced queries](https://github.com/git-stunts/git-warp/issues/559),
  [#562 Support-scoped fragment materialization](https://github.com/git-stunts/git-warp/issues/562),
  and [#563 Tick-range graph diff API](https://github.com/git-stunts/git-warp/issues/563)
  own the bounded-read execution model that keeps observers from falling back
  to whole-graph materialization by default.
- [#557 WESLEY Receipt Envelope Boundary](https://github.com/git-stunts/git-warp/issues/557)
  and [#554 Observer-readable receipts](https://github.com/git-stunts/git-warp/issues/554)
  own the receipt/provenance split between substrate facts, debug envelopes, and
  observer-readable truth.

## Reader contract

When an entry-point doc teaches a WARP noun:

- it must either link to [GLOSSARY.md](../GLOSSARY.md) or use the same status
  words: `shipped`, `transition`, or `target`
- it must not describe target doctrine as already available runtime behavior
- it must point unresolved semantic gaps at this audit, [WARP_DRIFT.md](WARP_DRIFT.md),
  or the owning GitHub Issue

This is the stop sign for accidental doctrine drift in release docs.
