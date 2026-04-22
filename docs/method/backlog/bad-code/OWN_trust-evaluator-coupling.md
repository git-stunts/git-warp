---
id: OWN_trust-evaluator-coupling
blocked_by: []
blocks: []
feature: sync-trust-security
---

# TrustEvaluator couples to TrustStateBuilder key encoding

**Effort:** S

## What's Wrong

`evaluateSingleWriter` scans `writerBindings` with `startsWith(`${writerId}\0`)`, directly coupling `TrustEvaluator` to `TrustStateBuilder`'s internal `\0`-separated key format. If the key encoding changes, `TrustEvaluator` silently breaks.

Additionally, the `RC` alias casts `TRUST_REASON_CODES` to a narrower type than the actual object — a lying cast that hides available reason codes from tooling.

## Suggested Fix

`TrustState` should expose `getBindingsForWriter(writerId)` so consumers never parse keys. Fix the `RC` cast to match the actual shape of `TRUST_REASON_CODES`.
