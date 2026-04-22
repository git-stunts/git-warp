---
id: BND_schemas-refine-mutation
blocked_by: []
blocks: []
---

# TrustRecordSchema superRefine mutates record during validation

**Effort:** S

## Problem

The Zod `superRefine` callback mutates `record.subject`, replacing it
with the parsed sub-schema result. Zod schemas should be pure validators;
mutation during refinement is surprising and fragile. It makes the
validation step order-dependent and hard to reason about.

## Suggested Fix

Use `.transform()` instead of `superRefine` for the mutation step, or
parse the subject separately and merge the results. Keep refinement
callbacks pure.
