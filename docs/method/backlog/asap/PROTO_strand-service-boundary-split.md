# PROTO: StrandService descriptor/materializer/intent split

## Legend

PROTO — protocol/domain structural improvement

## Problem

`StrandService.js` is ~2060 lines and currently owns too many
responsibilities:

- strand CRUD and ref layout
- descriptor parsing/normalization
- overlay metadata hydration
- braid ref synchronization
- patch-builder construction and patch commits
- intent queue construction and admission
- tick draining and persistence
- patch collection and materialization

This is not just a LOC issue. The file has a large normalization layer
because `StrandDescriptor`, `StrandIntentQueue`, and related payloads
are effectively shape-trusted bags. That pushes boundary parsing,
business logic, and persistence orchestration into one class.

That conflicts with the Systems Style rules:

- P1: domain concepts require runtime-backed forms
- P2: validation happens at boundaries and construction points
- P3: behavior belongs on the type that owns it

## Proposal

Split StrandService into narrower collaborators:

- `StrandDescriptorStore`
  - ref layout
  - descriptor read/write
  - overlay metadata hydration
  - braid ref sync
- `StrandMaterializer`
  - collect base/overlay/braided patches
  - apply Lamport ceiling
  - materialize descriptor state
- `StrandPatchService`
  - create patch builder
  - commit overlay patches
  - queue patch intents
- `StrandIntentService`
  - classify queued intents
  - drain queue
  - persist tick result

Keep `StrandService` as a thin facade over these components.

At the same time, introduce a real descriptor boundary:

- `StrandDescriptor`
- `StrandIntentQueue`
- `StrandTickRecord`

Those do not all need to become classes on day one, but they should at
least stop being anonymous normalized records spread across dozens of
helpers.

## Sequencing

Do **not** combine this refactor with the current coverage sprint.

Recommended order:

1. Finish coverage on existing StrandService behavior.
2. Use the tests as the executable spec.
3. Extract descriptor boundary first, then materializer/intent/patch
   collaborators one seam at a time.

## Impact

- Lower coupling between strand CRUD, patching, and materialization
- Cleaner descriptor boundary
- More reliable future work on braid/overlay semantics
- Smaller units for the eventual “Gods” breakup

## Related

- `docs/method/backlog/bad-code/PROTO_strand-service-god-object.md`
- `docs/method/backlog/bad-code/CC_untested-strand-services.md`

