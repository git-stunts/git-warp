---
id: PROV_btr-wire-dto-locality-guard
blocked_by: []
blocks: []
feature: btr-provenance-boundary
release_home: v18.0.0
---

# Guard BTR wire DTO locality

**Effort:** S

0099 introduced BTR wire DTOs as git-warp-local boundary shapes for one
retained shell family. They must remain local and narrow. If they start
carrying shared Continuum protocol responsibilities, git-warp will
accidentally grow a private schema family beside the authored
GraphQL/Wesley contracts.

## Problem

`BtrWireRecord` and `BtrWireProvenanceEntry` are acceptable only as
git-warp-local BTR shell DTOs. They must not drift into modeling
Continuum `Receipt`, `Witness`, `SuffixShell`, `ImportOutcome`,
`SettlementResult`, or generic hologram semantics.

## Acceptance

- Add conformance or documentation checks that `BtrWireRecord` and
  `BtrWireProvenanceEntry` remain git-warp-local.
- Prevent `Receipt`, `Witness`, `SuffixShell`, `ImportOutcome`, and
  `SettlementResult` names or responsibilities from creeping into BTR
  wire DTOs.
- Keep shared protocol families in Continuum/Wesley artifacts.

## Source

Created from 0099 drift/retro follow-up handling after the BTR repair
scope checkpoint identified schema-creep risk in the adapter boundary.
