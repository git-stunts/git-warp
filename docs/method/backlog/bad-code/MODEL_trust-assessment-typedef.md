---
id: MODEL_trust-assessment-typedef
blocked_by: []
blocks: []
feature: docs-dx
---

# TrustAssessment is a typedef-only domain concept

**Effort:** M

## What's Wrong

`TrustAssessment` is the primary output of the trust subsystem but exists only as a JSDoc typedef — no class, no constructor validation, no behavior. Three separate builder functions (`evaluateWriters`, `buildTrustStateErrorAssessment`, `buildErrorAssessment`) construct it with duplicated `Object.freeze` patterns. `TrustAssessmentV1` in `verdict.js` is a partial duplicate of the same shape.

This violates P1 (runtime truth wins) and DRY.

## Suggested Fix

Promote `TrustAssessment` to a class with constructor validation. Consolidate the builder functions into static factory methods or a single builder. Eliminate `TrustAssessmentV1` duplication.
