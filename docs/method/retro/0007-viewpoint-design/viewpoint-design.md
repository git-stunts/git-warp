# Cycle 0007 Retro — WorldlineSelector + defaultCodec

## Outcome

**Partial.**

WorldlineSelector hierarchy: shipped (PR #77). All 5,203 tests pass.
defaultCodec migration: failed. Reverted. Backlog item rewritten.

## What went well

### WorldlineSelector

- RED first. 51 tests written before implementation.
- Real `extends` — `instanceof WorldlineSelector` works.
- Constructor validation — rejects bad ceiling, empty strandId,
  non-object frontier.
- `#frontier` private field with defensive copy getter — real Map
  immutability, not fake `Object.freeze`.
- `toDTO()` bridge — public API unchanged, internal code clean.
- Self-review caught 7 issues including a behavioral regression
  (toDTO ceiling omission), double-clone waste, and registry
  hijack vector. All fixed before merge.
- Theory alignment: noun audit (cycle 0006) informed the naming.
  "WorldlineSelector" is the brutally literal name. "Viewpoint"
  was rejected. The design doc maps the concept against all 7
  papers.

### Design process

- Cycle 0005 failure (fake classes, no validation, kind tags kept)
  directly informed cycle 0007's design. The retro worked.
- Human sponsor caught the "Viewpoint is weird" problem and pushed
  for the observer/writer distinction that clarified the concept.
- The noun audit (cycle 0006) was the right intermediate step —
  design before code.

## What went wrong

### defaultCodec

Attempted to move `defaultCodec.js` to infrastructure. Three
approaches tried, all wrong:

1. **Re-export shim** — "leaves stanky tech debt behind." Hides the
   concrete dependency behind indirection without fixing the design.
2. **Thread codec through constructors** — 348 test failures. The
   codec injection chain is incomplete: WarpRuntime passes codec to
   some services, but many leaf services (index builders, serializers)
   construct sub-services without threading codec through.
3. **Revert to shim after failure** — "I didn't say go back to the
   shim."

The root cause: **the problem was misdiagnosed.** The original backlog
item said "move defaultCodec.js to infrastructure" — a file move.
The real P5 violation is that 20 domain services call
`codec.encode()`/`codec.decode()` directly. Domain services are doing
serialization. Moving the file doesn't fix that.

`defaultCodec` is a singleton pretending to be dependency injection.
Every service can bypass its caller by importing the global. The
`codec` constructor param is theater.

### Speed over understanding (again)

Same failure mode as cycle 0005. Jumped to implementation without
understanding why the code is shaped the way it is. The design doc
was written to justify the approach ("shim is fine" then "thread it
through"), not to understand the problem.

## What the redo needs

This is now an L-effort architectural item, not an S-effort file
move. Backlog item rewritten as
`NDNM_defaultcodec-to-infrastructure.md` with the full audit of
20 offending services and a phased approach.

**Corrected 2026-04-04:** The original redo plan (below, struck) was
still wrong — it kept serializer services alive, just in a different
folder. The real fix: domain services produce domain objects. The
persistence adapter serializes at the boundary. Serializer services
dissolve into the adapter layer. Port contracts speak domain types,
not bytes. `defaultCodec` disappears because nothing in domain needs
it.

~~1. Delete dead code (canonicalCbor.js)~~
~~2. Audit which services' primary concern IS serialization~~
~~3. Move serialization-primary services to infrastructure~~
~~4. For the rest, delegate serialization to adapters~~
~~5. When no domain service imports defaultCodec, delete it~~

See updated backlog item for corrected phased approach.

## Drift check

WorldlineSelector: no drift from design doc. Shipped as designed.
defaultCodec: massive drift — the design doc was rewritten three
times during the cycle, which is itself a signal that the problem
wasn't understood.

## New debt

- `canonicalCbor.js` is dead code (imported by nothing, tested but
  unused). Should be deleted immediately.

## Cool ideas

- The observer/writer distinction (observer = π, writer = full optic
  Ω) could inform how other codebase nouns evolve. Writers own
  frontiers and produce witnesses. Observers just project.
- The `toDTO()` bridge pattern (internal classes, external plain
  objects) could apply to other domain types that have public API
  surface — clean internal modeling without breaking consumers.

## Backlog maintenance

- `NDNM_defaultcodec-to-infrastructure` rewritten from S to L,
  reframed as architectural serialization extraction
- `NDNM_worldlinesource-to-viewpoint-hierarchy` consumed by this
  cycle (WorldlineSelector shipped)
