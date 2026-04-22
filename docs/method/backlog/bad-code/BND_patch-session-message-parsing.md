---
id: BND_patch-session-message-parsing
blocked_by: []
blocks: []
feature: observer-admission-runtime
---

# PatchSession classifies errors by parsing err.message

**Effort:** S

## What's Wrong

`PatchSession._classifyCommitError()` uses `errMsg.includes('Concurrent commit detected')` and `errMsg.includes('has advanced')` to classify errors. This is the "raccoon in a dumpster" anti-pattern from SSJS doctrine — behaviorally significant branching driven by string matching on human-readable text. If anyone rewords the message, the classification silently breaks.

Error type should be primary, not message content.

## Suggested Fix

Introduce `ConcurrentCommitError` and `RefAdvancedError` classes extending the appropriate domain error base. Throw those from the origin sites. Replace `_classifyCommitError()` string matching with `instanceof` dispatch (P7).
