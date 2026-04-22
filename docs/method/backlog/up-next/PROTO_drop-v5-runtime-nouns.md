---
blocked_by: []
blocks: []
id: PROTO_drop-v5-runtime-nouns
feature: runtime-boundaries
---

# Drop `V5` runtime nouns

## Problem

The repo still carries a lot of `V5` runtime naming that no longer means
anything precise:

- `reduceV5`
- `WarpStateV5`
- `StateReaderV5`
- `StateSerializerV5`
- `CheckpointSerializerV5`
- `VisibleStateComparisonV5`

That suffix used to point at an implementation era. Now it mostly creates noun
drift:

- it confuses runtime/public nouns with historical schema or migration eras
- it obscures which concepts are actually versioned and which are just badly
  named
- it makes design and implementation conversations harder than they need to be

Cycle `0041` hit this directly: calling a reducer `reduceV5` says nothing
useful about its real substrate or contract.

## Fix

Do a focused noun cut that removes `V5` from runtime and public API names where
the suffix is no longer semantically meaningful.

The rule should be:

- keep explicit version numbers only where a real wire/schema/storage version
  still exists
- remove them from runtime concepts, public surfaces, and internal helpers where
  they only describe historical lineage

Examples of preferred direction:

- `reduceV5` -> `reduce`
- `WarpStateV5` -> `WarpState`
- `StateReaderV5` -> a truthful state-reader noun
- `CheckpointSerializerV5` -> a truthful checkpoint serializer noun

## Scope

**In:** runtime/public noun audit, rename plan, compatibility strategy,
backlog/release-home for the actual cut.

**Out:** changing real schema version numbers where they still carry actual
meaning.
