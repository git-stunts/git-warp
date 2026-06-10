# PUBLIC API COSTS

Status: current v18 gate truth. This document classifies public API surfaces by
their current provider cost, not by the shape we eventually want.

The machine-readable inventory is
[public-api-cost-inventory.tsv](public-api-cost-inventory.tsv).

## Labels

| Label | Meaning | First-use docs |
| --- | --- | --- |
| `bounded` | Enforces memory and result limits, and does not rely on full graph residency. | Allowed. |
| `streaming` | Does not accumulate internally and does not read from a full-residency provider. | Allowed. |
| `cursor` | Returns a resumable bounded window. | Allowed. |
| `transitional` | Public shape points in the right direction, but the current provider still has a caveat named in the inventory. | Mention only with caveats. |
| `diagnostic` | May require full residency for inspection, repair, or operator evidence. | Not allowed as first-use app path. |
| `offline` | Intended for controlled migration or maintenance windows. | Not allowed as first-use app path. |
| `legacy` | Compatibility surface, not the new product model. | Not allowed as first-use app path. |

## Current Gate Truth

`worldline.prepareOpticBasis()` is classified as `transitional`: it verifies
existing checkpoint-tail read-basis evidence and fails closed when that evidence
is missing without building a basis by materializing the graph. The v18 release
gate has deterministic bounded-memory evidence for the named public paths it
claims, but this setup path remains caveated to available checkpoint-tail basis
evidence.

`coordinate.optic()` reads are also `transitional`. They use checkpoint-tail
shard facts and tail witnesses and reject unsupported basis shapes, excessive
tails, and read-identity failures instead of falling back to full graph
materialization. Their v18 release evidence is tied to checkpoint-tail basis
and tail witnesses, so broader graph questions must still use the row-specific
cost label instead of assuming global boundedness.

Ordinary public reads are classified by row. Exact id-only query reads are
`bounded`; row-specific broader reads remain `transitional`, `diagnostic`, or
`legacy` when they can still touch cached full state, full-result arrays, or
compatibility behavior.

Full materialization, state snapshots, full node arrays, full edge arrays, and
sync materialize-after-sync behavior are `diagnostic` or `legacy`. They remain
available for compatibility and operator work, but they are not first-use
application paths and they are not evidence that large graphs fit in memory.

## Release Rule

The v18 pre-tag release gate requires evidence that:

- documented first-use Optics setup avoids full graph materialization;
- normal public reads, writes, content lookup, and sync pass bounded-memory
  conformance against a graph larger than git-warp's configured memory pool;
- the v18 GitHub milestone has zero open issues before tag approval;
- `#552` closes with merged pre-tag release evidence.
