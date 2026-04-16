---
title: "Port surfaces boundary purge: parameterize CodecPort, type IndexStorePort and LoggerPort"
legend: "PURGE"
cycle: "0025B1-port-boundary-purge"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_purge-boundary-leaks.md"
parent_cycle: "0025B"
---

# Port surfaces boundary purge

Source backlog item: `docs/method/backlog/v17.0.0/PROTO_purge-boundary-leaks.md` (0025B1 section)
Legend: PURGE (sub-cycle of 0025B, parent cycle 0025 anti-sludge paydown)

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

Zero `unknown` keywords and zero `Record<string, unknown>` occurrences
in the public signatures of `src/ports/CodecPort.ts`,
`src/ports/IndexStorePort.ts`, and `src/ports/LoggerPort.ts`. All three
files graduate from `policy/quarantines/0025B-boundary.json`. No
`*Like` types introduced. No abstract parent classes with a single
implementation. No `any`, `as any`, or `as unknown as`.

## Playback Questions

### Human

- [ ] Do the three port files contain literal `unknown` or
      `Record<string, unknown>` in their public signatures? (expected:
      no — only safety-context `catch (err: unknown)` if any.)
- [ ] Did the regenerated `policy/quarantines/0025B-boundary.json`
      drop exactly the three port files? (expected: yes.)
- [ ] Are any new `*Like` types, abstract parents with one
      implementation, or cast-cosplay artifacts introduced? (expected:
      no — lessons from cycle 0023 applied.)
- [ ] Are adapter and caller updates minimal and mechanical — no
      new decoders invented beyond what the port-signature shift
      requires?

### Agent

- [ ] `grep -n '\bunknown\b' src/ports/CodecPort.ts
      src/ports/IndexStorePort.ts src/ports/LoggerPort.ts` returns
      zero non-comment matches.
- [ ] `grep -n 'Record<string, unknown>' src/ports/CodecPort.ts
      src/ports/IndexStorePort.ts src/ports/LoggerPort.ts` returns
      zero matches.
- [ ] `jq '.files | index("src/ports/CodecPort.ts")'
      policy/quarantines/0025B-boundary.json` returns `null` after
      contamination regeneration. Same for `IndexStorePort.ts` and
      `LoggerPort.ts`.
- [ ] The new domain types introduced under
      `src/domain/types/codec/` and `src/domain/types/log/` are named
      after real concepts (what the thing is), not shapes (what it
      resembles). No `*Like` suffix.
- [ ] All pre-existing tests pass: `npm run test:local` green.
- [ ] `npm run typecheck`, `npm run lint`, `npm run lint:sludge`, and
      `npm run lint:quarantine-graduate` are green.

## Accessibility and Assistive Reading

- Linear truth posture: the port files are short contract declarations
  with one concept per file. Replacement types live colocated at
  `src/domain/types/<area>/<name>.ts`, discoverable by `ls`.
- Non-visual or alternate-reading expectations: N/A (code-only).

## Localization and Directionality

N/A (code-only).

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents: the three port
  files encode a runtime-honest contract — `encode` says what it
  accepts, `decode` says what it produces, `info`/`debug`/`warn`/
  `error` accept a typed `LogFields` structure. No shrug types.
- What must be attributable: every new domain type has a constructor-
  or union-level validated shape, following SSTS P1 (runtime-backed
  forms). Every replacement is traceable to a single eliminated
  `unknown` or `Record<string, unknown>` occurrence.

## Non-goals

- [ ] No `*Like` abstractions. Cycle 0023 taught us this. Named
      concepts only.
- [ ] No abstract parent with one implementation. Cycle 0023
      taught us this too.
- [ ] No port-by-port rewrite of every downstream caller. Callers
      that break because of the port-signature change are fixed
      narrowly; callers that currently use the sludge but would
      pass typecheck under the new shape are left alone for later
      0025B sub-campaigns.
- [ ] No new adapter logic. Ports only. Existing adapters get
      mechanical signature updates; no behavior change.

## Scope

**In:**

- `src/ports/CodecPort.ts` — parameterize as
  `CodecPort<TDecoded = CodecValue, TEncoded = TDecoded>`.
- `src/ports/IndexStorePort.ts` — parameterize `decodeShard` as a
  per-call generic `decodeShard<TDecoded extends CodecValue>(...)`
  so callers name the shape they expect.
- `src/ports/LoggerPort.ts` — accept `LogFields` with a constrained
  `LogFieldValue` union.
- `src/domain/types/codec/CodecValue.ts` — new transport union for
  structured-codec round-trippable values.
- `src/domain/types/log/LogFieldValue.ts` — new transport union for
  log-field values.
- `src/domain/types/log/LogFields.ts` — new transport record type.
- Adapter updates in `src/infrastructure/adapters/**` for the two
  `LoggerPort` implementors and any codec adapter that needs its
  override signature to match.
- Caller sites whose types break because of the tightened port
  signature.

**Out:**

- 0025B2..B5 cluster campaigns (controllers, strand, index, state,
  sync, types, utils, errors).
- Adapter internal refactors not required by the signature shift.
- Removal of `Record<string, unknown>` from files that don't import
  the three ports transitively.
- Cycle 0025A cast purge (`as unknown as`).

## Backlog Context

### Problem

Per `docs/method/backlog/v17.0.0/PROTO_purge-boundary-leaks.md`:

> A port that returns `unknown` or takes `Record<string, unknown>`
> exports undecoded reality into core. Fix by:
>
> - **`CodecPort`** → `CodecPort<TDecoded, TEncoded = Uint8Array>`,
>   or a `DecoderPort<T>` with a schema argument. A decoder that
>   returns `unknown` is not a decoder — it's a shrug.
> - **`IndexStorePort`** → typed query/result objects, named filter
>   types, typed index record shapes.
> - **`LoggerPort`** → constrained `LogFieldValue` union,
>   `LogFields` / `DiagnosticContext` / `AuditFields`.
>
> Port cleanup is the choke point — unblocking ports unblocks many
> downstream sites.

### Design decisions locked

**CodecPort parameterization with a concrete `CodecValue` default.**
Two generic parameters, default `TDecoded = CodecValue` and
`TEncoded = TDecoded`. The default is a named structured-value union
— not `unknown`. Callers that care about a specific payload (`Patch`,
shard payload, receipt, etc.) can specialize to `CodecPort<Patch>`
etc. without re-declaring the port. Generic-method alternative
(`decode<T>()` on a non-generic class) rejected: it hides the `T` at
every call, offering no improvement over bare `unknown`.

**`decodeShard` becomes a per-call generic.** `IndexStorePort` is not
parameterized at the class level because shards are heterogeneous
(MetaShard, EdgeShard, PropertyShard, etc.) and a single-impl
adapter handles all of them. Per-call generic names the expected
shape at the call site — same runtime behavior, honest type.

**LogFields is a recursive `type` alias, not a `class`.** Log fields
have no invariants, no identity, no behavior. They are pure transport
data. SSTS P1 requires a runtime-backed class only for concepts with
invariants; a constrained record of primitives is correctly a
`type`. `interface` is reserved for ports (AGENTS.md / SSTS).

**No `DiagnosticContext` or `AuditFields` yet.** The backlog item
mentions those as candidates. `LogFields` is sufficient for all
three levels of logger context (debug, info, warn, error) and the
child-logger context. Introducing named subsets would be sludge
pre-decomposition. If a real distinction emerges later, a downstream
cycle can add it.

### Option B residuals (Option A / Option B per the backlog item)

Preferred path (Option A): thread generics through call sites. This
will be partial — where a caller already wants a specific shape, we
thread. Where the caller is genuinely polymorphic (the shared
codec used across shard pipelines), the concrete default
`CodecValue` absorbs the generic without blowing up scope.

Fallback (Option B) residuals expected:

- Domain files already in `0025B-boundary.json` that use
  `codec.decode(buf) as X` keep their casts — those casts belong to
  cycle 0025A (`as unknown as`) and cycle 0025B5 (scattered
  boundary leaves). Not this sub-cycle's scope.
- Logger callers that type a local `context: Record<string,
  unknown>` and pass it to `logger.*` remain in the quarantine for
  0025B5 unless the specific logger-port signature mismatch is
  unresolvable any other way.

### Relationship to cycle 0023

0023's lesson: do not manufacture an abstract parent class for a
single-implementation concept. This sub-cycle does not add abstract
parents — the three ports stay as single-class contracts, with
generic type parameters added where the contract is honestly
parametric. `CodecValue` is a `type` union (pure DTO), not a class
hierarchy — there are no invariants to guard, and runtime-dispatch
is not a concern for transport values.
