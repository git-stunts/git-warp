---
id: COOL_query-hologram-explain-plan
blocked_by: []
blocks: []
feature: materialization-query-index
---

# Query Hologram Explain Plan

## Idea

Add a query explain-plan mode that shows which read strategy a query
used:

- full materialization
- sliced materialization
- cursor traversal
- cached hologram boundary
- stream-drain fallback

## Why It Is Cool

It turns "are we secretly materializing the whole graph?" into visible
evidence instead of vibes.

## Guardrails

- Keep this parked until query/read-model seams are more stable.
- Do not add runtime logging blobs or a generic explain manager.
- The output should report read strategy and cost evidence, not expose
  internal RuntimeHost machinery.
- Pull this only as a design-first cycle with clear public/debug API
  boundaries.
