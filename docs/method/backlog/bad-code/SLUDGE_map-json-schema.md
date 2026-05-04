---
id: SLUDGE_map-json-schema
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Sludge map has no formal JSON schema

**Effort:** S

## What's Wrong

`policy/sludge/sludge-map.json` is JSON-valid and covered by
`test/conformance/sludgeAtlas.test.ts`, but it does not have a formal
schema. The current conformance test checks the immediate atlas
contract, not the full shape of the format.

## Why This Matters

The sludge map is now process infrastructure. If future agents extend it
without a schema, the format can drift into inconsistent fields and
partial noun proofs.

## Suggested Fix

Add a formal schema for the sludge map and validate the map against it.
Keep the conformance test for high-level semantic requirements.

## Acceptance

- Add a formal schema for `policy/sludge/sludge-map.json`.
- Validate the sludge map against the schema.
- Keep `sludgeAtlas.test.ts` or equivalent conformance coverage.
- Document allowed layers and required finding/proposed-noun fields.
