# CLEAN_CODE

Un-shittifying the codebase. Systematically.

## What it covers

Structural quality work that makes the code honest: god object
decomposition, raw error replacement, type boundary cleanup,
constructor hygiene, redundant data structure elimination, and
enforcing the policies that prevent regression (file size limits,
one-thing-per-file, lint ratchets).

This is not feature work. This is not performance optimization.
This is making the code say what it means, and meaning what it says.

## Who cares

### Sponsor human

James — maintains this codebase long-term. Wants to open any file
and understand it without scrolling past 500 lines of mixed
concerns. Wants `new Error()` to never appear where a domain error
class exists. Wants the hexagonal boundary to be real, not
aspirational.

### Sponsor agent

Claude — reads and modifies this code every session. God objects
force full-file reads. Mixed concerns make targeted edits risky.
Raw errors lose context in stack traces. Type poison cascades
through downstream files. Every structural problem multiplies the
cost of every future task.

## What success looks like

- No source file exceeds 500 LOC (test files 800, CLI 300)
- Every thrown error is a domain error class, never raw `Error`
- Each file exports one primary thing
- Port boundaries are honest — domain services don't require I/O
  infrastructure
- Constructor parameter lists are legible (config objects, not
  positional sprawl)
- No redundant data structures sitting in memory alongside each
  other
- The ESLint `max-lines` ratchet enforces the ceiling and the
  relaxation list only shrinks

## How you know

- `npm run lint` passes with the `max-lines` rule enforced
- `grep -r 'new Error(' src/domain/` returns zero hits
- The relaxation block in `eslint.config.js` has fewer entries than
  it did last cycle
- No file in `bad-code/` has been there for more than 3 cycles
  without being pulled

## Current surface

### bad-code/

All 10 items in `docs/method/backlog/bad-code/` fall under this
legend:

- `PROTO_strand-service-god-object.md` — 2048 LOC, 40+ methods
- `PROTO_audit-receipt-raw-error.md` — 18 raw Error throws
- `PROTO_sync-protocol-raw-error.md` — raw Error with manual code
- `PROTO_patchbuilder-12-param-constructor.md` — config sprawl
- `PROTO_receipt-op-type-redundant.md` — dead mapping table
- `PROTO_warpserve-domain-infra-blur.md` — hex boundary violation
- `DX_trailer-codec-type-poison.md` — untyped boundary infects 6 files
- `DX_exact-optional-conditional-spread.md` — 30 verbose sites
- `PERF_toposort-full-adjacency.md` — wasteful memory allocation
- `PERF_transitive-reduction-redundant-adjlist.md` — redundant structure

### asap/

- `DX_max-file-size-policy.md` — the ratchet that prevents regression
- `DX_restore-dot-notation.md` — lint rule gap from TSC campaign
- `DX_agent-code-audit.md` — audit agent-authored code from TSC blitz
- `DX_trailer-codec-dts.md` — upstream fix that kills type poison
- `PROTO_effectsink-breaking-change.md` — breaking change hygiene
- `PROTO_warpkernel-port-cleanup.md` — persistence union types
- `PROTO_warpruntime-god-class.md` — the other god object

## Legend code

`CC` — for backlog items that belong to this legend.

```
CC_strand-service-decomposition.md
CC_raw-error-purge.md
CC_max-lines-ratchet.md
```
