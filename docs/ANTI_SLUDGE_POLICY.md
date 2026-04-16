# Anti-SLUDGE TypeScript Policy

**Status:** Binding
**Applies to:** all handwritten and LLM-generated TypeScript and JavaScript in this repository
**Enforcement:** ESLint + Semgrep + IRONCLAD M9 + shell policy checks + CI gates
**Default outcome for violations:** reject the patch

**Companion docs:**

- [`docs/ANTI_SLUDGE_DECISIONS.md`](./ANTI_SLUDGE_DECISIONS.md) — binding adoption decisions
- [`docs/SYSTEMS_STYLE_TYPESCRIPT.md`](./SYSTEMS_STYLE_TYPESCRIPT.md) — foundations
- [`AGENTS.md`](../AGENTS.md) — LLM-facing instructions + rejection list

---

## 0. Purpose

This repository does not accept "technically valid" TypeScript that
is vague, weakly modeled, architecture-free, or boundary-leaking.

TypeScript is not here to create the illusion of safety. It is here
to express **real domain concepts**, **explicit boundaries**, and
**mechanically enforceable structure**.

If the code compiles but violates this policy, the code is wrong.

Cycle 0023 made the cost of shape-trust legible: we introduced an
abstract class (`ORSetLike`) with exactly one implementation, named
after a vague shape. It violated SSTS and was reverted within one
session. Every `*Like`, every `as unknown as`, every untyped
boundary is a smaller version of that same mistake.

---

## 1. Architecture law: hexagonal or it is wrong

This repository uses **hexagonal architecture**.

### Required layers

- **Domain** (`src/domain/`): pure business logic and domain types.
- **Ports** (`src/ports/`): capability interfaces for external work.
- **Infrastructure / Adapters** (`src/infrastructure/`): port
  implementations and all interaction with external systems.

This repo does not have a separate `src/application/` layer. Use-
case orchestration lives in `src/domain/services/` and
`src/domain/services/controllers/`.

### Dependency rule

Dependencies point inward only.

- `domain` depends on nothing external (no Node APIs, no host
  globals, no framework or adapter imports).
- `ports` defines interfaces; may depend on domain *types* only.
- `infrastructure` may depend on ports, domain, and external
  libraries.
- `domain` and `ports` must **never** import from `infrastructure`.
- `domain` and `ports` must **never** import Node platform APIs or
  framework libraries.

### External effects belong in adapters

The following do **not** belong in `src/domain/**` or
`src/ports/**`:

- `fetch`
- database clients
- framework request/response objects (Express, Fastify, Next, etc.)
- `process.env`
- `Date.now()` / `new Date()` / `Date()` / `performance.now()`
- `Math.random()` / `crypto.randomUUID()` / `crypto.getRandomValues()`
- `setTimeout` / `setInterval`
- filesystem access (`node:fs`, `fs`, `path`, etc.)
- network clients (`node:http`, `node:https`, `node:net`, etc.)
- streams (`node:stream`)
- process spawning (`node:child_process`)
- `JSON.parse` / `JSON.stringify`
- wire-format decoding
- logging libraries

All of that belongs in adapters.

Time, randomness, and environment flow through ports instead:

- `ClockPort` for timestamps
- `RandomPort` / seeded PRNG for randomness
- Parameters or configuration objects for environment-derived values

---

## 2. Banned sludge types

### Completely banned (no exceptions, no adapters)

- `any`
- `as any`
- `as unknown as`
- `FooLike`, `BarLike`, `*Like` placeholder types of any kind
- public APIs returning transport-native blobs instead of domain types
- index-signature-as-model design for domain entities
- giant generic helper abstractions that erase the actual domain
- DTO leakage into core logic
- `Function`, `object`, `Promise<any>`, `Array<any>`

### Boundary-only, never core

These may appear **only inside `src/infrastructure/adapters/**`**:

- `unknown`
- `Record<string, unknown>`

They are temporary raw-input containers only. They must be decoded
immediately into explicit transport or domain types. The decoded
form is what leaves the adapter.

### Strongly discouraged and usually rejected

- `Partial<T>` for real domain object construction
- long `Pick<>` / `Omit<>` / `Required<>` chains that obscure meaning
- optional-property soup for lifecycle state
- boolean flag bags
- "result objects" with many optional fields and no clear state model

If the type has meaning, name it.

---

## 3. Model exact concepts, not shape approximations

### Bad

- `UserLike`
- `Record<string, unknown>`
- `Partial<Order>`
- `thing: any`
- `payload: unknown` in domain code

### Good

- `User`
- `CreateOrderCommand`
- `OrderDraft`
- `PersistedOrder`
- `WebhookDecodeError`
- `ClockPort`

### Lifecycle states must be explicit

Do not represent state machines with optional fields and vibes.

Bad:

```typescript
type Job = {
  id?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  status?: string;
};
```

Good — one class per state, with shared abstraction or
discriminated union:

```typescript
class PendingJob { readonly id: JobId; /* ... */ }
class RunningJob { readonly id: JobId; readonly startedAt: Instant; /* ... */ }
class FailedJob  { readonly id: JobId; readonly startedAt: Instant; readonly error: JobError; /* ... */ }
class SucceededJob { readonly id: JobId; readonly startedAt: Instant; readonly finishedAt: Instant; /* ... */ }
```

### Prefer `instanceof` dispatch over tag switching

SSTS P7: runtime dispatch over tag switching. Use `instanceof` on
classes instead of `switch (obj.kind)`.

---

## 4. Boundary discipline: decode once, then stay honest

This is a hard rule.

### Adapters may

- accept raw HTTP/JSON/DB/env/input
- decode raw values into explicit types (domain class or DTO)
- call domain logic with decoded values
- encode domain results back into wire or storage formats

### Core may

- operate only on already-decoded values
- never parse raw transport data
- never inspect ad-hoc object shapes from external systems

There must be a visible place where the raw world becomes the
typed world. No invisible shape drift. No inline property poking
in business logic. No "just check a few fields here" sludge.

---

## 5. No conditional puddle assembly

This pattern is banned:

```typescript
const thing: any = {};

if (input.a) thing.a = input.a;
if (input.b) thing.b = input.b;
if (input.c) thing.c = normalize(input.c);
```

That is not modeling. That is puddle assembly.

Use a decoder, normalizer, constructor with invariants, or domain
factory returning a precise result type.

---

## 6. Function design rules

### Name functions after intent

Bad: `handleData`, `processThing`, `transformResponse`, `doStuff`.
Good: `decodeWebhookPayload`, `admitPatch`, `persistReceipt`,
`foldIntoFrontier`.

### No boolean positional arguments

Use named parameter objects or separate methods.

### No mutation of inputs

Return new values or explicit result objects. Do not patch
caller-owned state.

### No throwing for expected failures

Expected failures must be modeled as return values. Throw only for
unrecoverable programmer bugs or impossible states.

### Exhaustiveness required

Switches over unions must be exhaustive. Use an `assertNever`
helper when appropriate.

---

## 7. Module design rules

### No junk-drawer filenames

These filenames are banned in `src/`:

- `utils.ts`
- `helpers.ts`
- `misc.ts`
- `common.ts`

Modules are named after the concept they own.

### One thing per file

If a file mixes decoding, business rules, persistence, retries, and
presentation, it is wrong. Split it.

### Do not hide boundaries with barrel files

Avoid giant barrel files that erase architecture. Imports should
make layer crossings obvious.

---

## 8. Raw Error and @ts-ignore bans

### No raw `Error` / `TypeError` in domain

Domain code must throw domain error classes extending `WarpError`,
which carry a structured `code` field for `instanceof` / code-based
dispatch.

### No `@ts-ignore`

Use `@ts-expect-error` instead, and provide a justification. The
IRONCLAD M9 gate enforces this.

### No `z.any()` if Zod is used

Use `z.custom()` or `z.unknown()` (with immediate decode) instead.

---

## 9. Determinism

Core logic must be deterministic.

### Banned in `src/domain/**`

- wall-clock reads (`Date.now`, `new Date`, `Date()`,
  `performance.now`)
- randomness (`Math.random`, `crypto.randomUUID`,
  `crypto.getRandomValues`)
- timers (`setTimeout`, `setInterval`)
- ambient env reads (`process.env`)
- hidden singleton state
- implicit global caches

Use ports: `ClockPort`, and seeded PRNG or a `RandomPort`.

---

## 10. Complexity discipline

### Hard caps on source files

- `complexity`: 5 (function-level cyclomatic complexity)
- `max-depth`: 3 (statement nesting)
- `max-lines-per-function`: 30
- `max-params`: 3
- `max-nested-callbacks`: 3

### Per-file carve-outs

Deliberate exceptions for algorithm-heavy modules are listed in
`eslint.config.js`. New algorithm-heavy files must be added to that
list explicitly with a comment explaining why. "This is complex"
without justification is not a carve-out.

### File size limits

- Source: 500 LOC
- Test: 800 LOC
- Bin/scripts: 300 LOC

---

## 11. Quarantine rules

Pre-existing violations are tracked in
`policy/quarantines/0025{A,B,C,D}-*.json` manifests. These are
**temporary**, owned by the purge sub-cycles:

| Manifest | Rule family | Owning cycle |
|---|---|---|
| `0025A-casts.json` | `as unknown as`, `as any` | 0025A |
| `0025B-boundary.json` | `unknown` / `Record<string, unknown>` outside adapters; `JSON.parse`/`fetch`/`process.env` in core | 0025B |
| `0025C-fake-models.json` | `*Like` types | 0025C |
| `0025D-import-law.json` | core→infrastructure/framework imports | 0025D |

### Rules for quarantines

- **Rule-scoped.** A file quarantined for one family does not
  receive a free pass on any other family.
- **Graduation on touch.** If a quarantined file is modified in a
  branch (diff basis: `git merge-base <base> HEAD`), the
  `quarantine-graduate-check` CI gate fails unless the file is
  either removed from the manifest (sludge fixed) or replaced with
  narrow inline suppressions referencing specific lines.
- **No generic file-cursed bucket.** There is no "ignore everything
  about this file" option.
- **Manifests shrink only.** Adding new entries is equivalent to
  adding new sludge to the repository, and is rejected.

---

## 12. Runtime honesty over compile-time theater

TypeScript does not validate runtime data. Therefore:

- External data must be decoded at runtime.
- Internal logic must assume decoded inputs.
- Compile-time types must correspond to actual runtime guarantees.

A cast is not validation. It is a costume.

---

## 13. Preferred patterns

- pure domain functions
- explicit ports and adapters
- discriminated unions and sealed class hierarchies
- exact named types (SSTS P1: runtime-backed forms)
- boundary-local decoders
- explicit result types
- composition over inheritance
- immutable data flow (`Object.freeze`, `readonly`)
- testable use-cases
- adapters that are thin and boring

Boring adapters are a compliment.

---

## 14. Automatic rejection criteria

Reject the patch immediately if it introduces any of the following
in non-adapter code:

- `any`
- `unknown`
- `Record<string, unknown>`
- `as unknown as`
- `*Like` placeholder types
- `JSON.parse`
- `JSON.stringify`
- `fetch`
- `process.env`
- `Date.now()` / `new Date()` / `Date()` / `performance.now()`
- `Math.random()` / `crypto.randomUUID()` / `crypto.getRandomValues()`
- `setTimeout` / `setInterval` (in domain)
- raw `new Error(...)` / `new TypeError(...)` (in domain)
- DB clients or framework types in core
- `@ts-ignore`
- `z.any()`
- `import` from `src/infrastructure/**` inside `src/domain/**` or `src/ports/**`

Also reject if:

- decoding is mixed into business logic
- adapters leak transport shapes into core
- lifecycle state is modeled by optional-property soup
- a single file mixes architectural layers
- a cast is used where a decoder or explicit type should exist

---

## 15. Tooling responsibilities

| Gate | What it catches | Source |
|---|---|---|
| ESLint (`npm run lint`) | Author-time violations of type, import, complexity, and pattern rules | `eslint.config.js` |
| Semgrep (`npm run lint:semgrep`) | Regex/pattern sludge ESLint can't cleanly express | `semgrep/typescript-anti-sludge.yml` |
| Shell sludge check (`npm run lint:sludge`) | Junk-drawer filenames + regex sweeps across `src/` | `scripts/check-anti-sludge.sh` (TBD) |
| IRONCLAD M9 (`npm run typecheck:policy`) | `@ts-ignore`, `z.any()`, wildcard ratchet | `scripts/ts-policy-check.ts` |
| Determinism (`ban-nondeterminism`) | Time/random/env in `src/domain/**` | `scripts/ban-nondeterminism.ts` |
| Quarantine graduation | Touched quarantined files must graduate or narrow | `scripts/quarantine-graduate-check.ts` (TBD) |
| TypeScript (`npm run typecheck`) | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc. | `tsconfig.base.json` |

All gates run in CI (`ci.yml`) and must pass before merge.

---

## 16. Final rule

This policy is not advisory.

- "LLM wrote it that way" is not an excuse.
- "TypeScript allowed it" is not a defense.
- "Works for now" is not a quality bar.
- "We've always done it that way" is the sludge rationalization —
  the quarantines exist specifically to end that excuse.

If the code is vague, fake-safe, boundary-leaking, or architecture-
less, reject it.
