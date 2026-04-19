# Witnessed suffix admission shells

Refines:

- `docs/design/0025D-import-law`
- `docs/method/retro/0017-admission-kernel/admission-kernel.md`

## Why

git-warp sync still exposes the older story:

- send frontier
- compute missing per-writer patch ranges
- return patches
- apply patches locally

That is workable, but it is no longer the strongest WARP story. The
current design target is that remote suffixes are transported claim
families and import is ordinary witnessed admission after
normalization to a comparable frontier. The durable object is an
import shell / hologram, not a glorified patch list.

## What it should look like

- Export produces a **witnessed suffix shell** rather than a naked
  patch response.
- The shell names:
  - graph and lane identity
  - base frontier / comparable basis
  - transported imported site
  - patch or BTR references
  - witness required for replay, audit, and bounded revelation
- Import is an admission act that returns an explicit outcome:
  - admitted
  - staged
  - plural
  - conflict
  - obstruction
- Independent imports are expected to converge up to shell
  equivalence, not merely "same final state after applying patches."
- Divergence is never silently degraded into skipped-writer folklore.
- Frontier negotiation may remain as an optimization, but it is not
  the semantic heart of the protocol.

## Done looks like

- sync request/response types no longer equate protocol truth with
  `frontier + patches`
- one export path emits a typed suffix shell
- one import path normalizes to a comparable frontier before deciding
- one test proves order-independent shell equivalence for independent
  imports
- one non-independent test yields explicit plural/conflict/obstruction
  instead of silent skip-and-carry-on behavior

## Starting points

- `src/domain/services/sync/SyncProtocol.ts`
- `src/domain/services/sync/syncRequestResponse.ts`
- `src/domain/services/controllers/SyncController.ts`
- `docs/invariants/state-provenance-separation.md`

## Non-goals

- Do not settle the final transport codec here.
- Do not require fully general trust/governance policy in the first
  cut.
- Do not remove frontier summaries as a performance optimization if
  they remain useful after the semantic upgrade.
