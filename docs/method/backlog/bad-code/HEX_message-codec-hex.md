---
id: HEX_message-codec-hex
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# MessageCodecInternal imports @git-stunts/trailer-codec in domain

**Effort:** M

## Problem

A domain service module directly imports the infrastructure dependency
`@git-stunts/trailer-codec` and constructs `TrailerCodec`/
`TrailerCodecService` internally. A lazy singleton prevents injection
and makes testing difficult. This violates hexagonal architecture --
domain must not depend on infrastructure.

## Suggested Fix

Move the trailer codec usage to infrastructure. Inject via a codec port
or pass through `WarpRuntime`.
