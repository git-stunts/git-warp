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
| `transitional` | Public shape points in the right direction, but the current provider is not yet fully bounded. | Mention only with caveats. |
| `diagnostic` | May require full residency for inspection, repair, or operator evidence. | Not allowed as first-use app path. |
| `offline` | Intended for controlled migration or maintenance windows. | Not allowed as first-use app path. |
| `legacy` | Compatibility surface, not the new product model. | Not allowed as first-use app path. |

## Current Gate Truth

`worldline.prepareOpticBasis()` is now classified as `transitional`: it verifies
existing checkpoint-tail read-basis evidence and fails closed when that evidence
is missing without building a basis by materializing the graph. It is not yet a
large-graph bounded-memory claim because setup still lacks an explicit memory
budget contract.

`coordinate.optic()` reads are also `transitional`. They use checkpoint-tail
shard facts and tail witnesses and reject unsupported basis shapes, excessive
tails, and read-identity failures instead of falling back to full graph
materialization, but the basis/tail providers are not memory-budgeted yet.

Most ordinary public reads are still `transitional`. Their API shape is useful,
but the current provider may still come from cached full state or full-result
arrays. Gate 2 turns the normal public path into a true bounded-memory product
claim.

Full materialization, state snapshots, full node arrays, full edge arrays, and
sync materialize-after-sync behavior are `diagnostic` or `legacy`. They remain
available for compatibility and operator work, but they are not first-use
application paths and they are not evidence that large graphs fit in memory.

## Release Rule

V18 remains blocked until:

- documented first-use Optics setup avoids full graph materialization;
- normal public reads, writes, content lookup, and sync pass bounded-memory
  conformance against a graph larger than git-warp's configured memory pool;
- `#547` and `#552` close with merged evidence.
