---
title: "Anti-sludge purge: eliminate casts, boundary leakage, fake models, and import hopping"
legend: "PURGE"
cycle: "0025-anti-sludge-purge"
source_decision: "docs/ANTI_SLUDGE_DECISIONS.md"
---

# Anti-sludge purge

Source decision memo: `docs/ANTI_SLUDGE_DECISIONS.md`
Legend: PURGE (paydown of pre-existing sludge quarantined at rule-adoption time)

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

Zero quarantine entries across all four manifests
(`policy/quarantines/0025{A,B,C,D}-*.json`). Zero `as unknown as`,
zero `Record<string, unknown>` outside adapters, zero `unknown`
outside adapters, zero `*Like` types, zero direct `JSON.parse`,
`JSON.stringify`, `fetch`, `process.env`, `Date.now()`, `new Date()`,
`Math.random()`, or forbidden adapter/framework imports in core.

## Structure: four sub-cycles

This cycle is split into four sequential sub-cycles. The order is
deliberate and load-bearing.

| # | Sub-cycle | Backlog item | Removes |
|---|---|---|---|
| 0025A | Cast purge | `PROTO_purge-cast-hacks` | `as unknown as`, `as any` |
| 0025B | Boundary purge | `PROTO_purge-boundary-leaks` | `Record<string, unknown>`, `unknown` outside adapters, raw I/O in core |
| 0025C | Fake-model purge | `PROTO_purge-fake-models` | `*Like` placeholder types |
| 0025D | Import law | `PROTO_purge-import-law` | core→adapter and core→framework imports |

### Why this order

1. **Casts first (0025A).** Casts are sludge concealment. A file
   with `foo as unknown as SomeType` can hide any number of
   downstream violations. Removing casts forces the real types to
   surface and makes the other cleanups tractable.
2. **Boundary leakage next (0025B).** `Record<string, unknown>` is
   usually the *upstream* of casts — the boundary didn't decode,
   so the domain either lives with the raw shape or casts to escape
   it. Fix the boundary and the downstream casts go away.
3. **Fake models (0025C).** `*Like` is usually decorative — it
   tries to describe a shape that the boundary decoder should
   already name. Most `*Like` types evaporate once 0025A and 0025B
   are done. The remainder get real names.
4. **Import law (0025D).** Once the types are honest and decoded at
   boundaries, the wall between core and adapter/framework code is
   meaningful. Enforcing it last prevents churn during the earlier
   purges.

## Playback Questions

### Human

- [ ] Are all four manifests at zero entries?
- [ ] Are any new `*Like`, `as unknown as`, or
      `Record<string, unknown>` violations introduced during the
      cycle? (expected: zero — policy is hot-adopted for net-new)
- [ ] Does `scripts/quarantine-graduate-check.ts` still pass for
      every remaining quarantine entry?

### Agent

- [ ] For each graduated file: the graduation is achieved by fixing
      the sludge, not by removing the file from `src/` or by
      migrating to an allowlisted path.
- [ ] For each replacement: the new code follows SSTS — runtime-
      backed classes, validated constructors, `instanceof` dispatch,
      no shape-trust.
- [ ] Cycle retro records per-family counts (start, end, delta)
      from each manifest.

## Non-goals

- [ ] No `verbatimModuleSyntax` migration (separate future cycle).
- [ ] No `consistent-type-definitions` rule (architecture-specific
      port/class rule wins).
- [ ] No adoption of bundle-weaker rules where git-warp is already
      stricter (determinism, complexity, raw-Error bans).

## Scope

**In:**
- Execution of sub-cycles 0025A → 0025D in order.
- Per-family manifest shrinkage — each purge cycle empties exactly
  its own manifest.
- Updates to `src/` only; `test/` keeps relaxed rules per existing
  policy.

**Out:**
- New features.
- `src/infrastructure/adapters/**` sludge (adapters are boundary
  code — `unknown`/`Record<string, unknown>` are permitted there by
  design, per the bundle's carve-out).
- Refactoring beyond what the purge mechanically requires.

## Success criteria

- `policy/quarantines/0025A-casts.json` → `files: []`
- `policy/quarantines/0025B-boundary.json` → `files: []`
- `policy/quarantines/0025C-fake-models.json` → `files: []`
- `policy/quarantines/0025D-import-law.json` → `files: []`
- `npm run lint`, `npm run typecheck`, `npm run lint:semgrep`,
  `npm run lint:sludge`, `npm run lint:quarantine-graduate` all green.
- No new violations introduced (check: contamination regenerate
  produces empty file sets).

## Artifacts that will exist on exit

- Four closed retros: `docs/method/retro/0025A-*/`,
  `docs/method/retro/0025B-*/`, `docs/method/retro/0025C-*/`,
  `docs/method/retro/0025D-*/`.
- This cycle's retro: `docs/method/retro/0025-anti-sludge-purge/`,
  referencing the four sub-cycle retros and recording
  start-vs-end manifest counts.
- Zero quarantine files, OR quarantine files with `files: []`.

## Related

- [`docs/ANTI_SLUDGE_DECISIONS.md`](../../ANTI_SLUDGE_DECISIONS.md) — binding decisions
- [`docs/ANTI_SLUDGE_POLICY.md`](../../ANTI_SLUDGE_POLICY.md) — full policy
- [`docs/SYSTEMS_STYLE_TYPESCRIPT.md`](../../SYSTEMS_STYLE_TYPESCRIPT.md) — foundations
- [`AGENTS.md`](../../../AGENTS.md) — LLM-facing instructions + rejection list
