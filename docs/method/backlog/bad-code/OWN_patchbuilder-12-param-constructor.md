---
id: OWN_patchbuilder-12-param-constructor
blocked_by: []
blocks: []
feature: materialization-query-index
---

# PatchBuilderV2 12-parameter constructor

**Effort:** M

## Problem

`PatchBuilderV2` constructor accepts 12+ parameters including
`persistence`, `graphName`, `writerId`, `lamport`, `versionVector`,
`getCurrentState`, `expectedParentSha`, `targetRefPath`,
`onCommitSuccess`, `onDeleteWithData`, `codec`, `logger`,
`blobStorage`, `patchBlobStorage`. This is a configuration object,
not dependency injection — most params are runtime state, not
services.

## Possible fix

Split into a `PatchBuilderConfig` value object for static config and
pass mutable state separately.
