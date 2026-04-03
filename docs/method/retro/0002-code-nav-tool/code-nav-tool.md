# Retrospective: 0002-code-nav-tool

**Date:** 2026-04-01
**Type:** Design
**Outcome:** Partial — pivoted

## What happened

Started as a design cycle for "code-nav" — an AST-aware symbol
extraction tool for LLM agents. Wrote a full design doc with hill,
playback questions, phasing, and project structure. Added concrete
before/after scenarios with token cost analysis.

Then James introduced empirical data from Blacklight (1,091 sessions,
291K messages, 4.5 months). The data reframed the problem:

- Read burden is 96.2 GB — 6.6x all other tools combined
- The dominant cost is context compounding, not individual reads
- A dynamic read cap alone cuts burden by 54.5%
- Session length caps cut it by 58.9%
- Both combined: 75.1%

James's Editor's Edition review delivered the verdict:

- **APPROVE** the insight (AST-aware extraction is right)
- **REJECT** the framing (code-nav alone is too small)
- **ENHANCE** into safe-context — a policy-enforcing read layer
  where AST extraction is one capability, not the product

The design doc was rewritten from scratch as safe-context. The cycle
is closing as a pivot — the design deliverable is complete, but the
product identity changed fundamentally mid-cycle.

## Hill assessment

**Original hill:** "An agent can extract any named symbol's source
code, see the structural outline of any file, and find where symbols
are defined — without reading full files."

**Status:** Not met (pivoted before implementation). The hill was
correct but undersized. It was replaced by:

"An agent can obtain the minimum structurally correct context
required to act — without injecting large raw artifacts into
long-lived conversation state."

## Drift check

- Cycle 0002's design directory contains the full evolution: the
  original code-nav doc and its rewrite as safe-context. Provenance
  is intact.
- No code was written. No tests. No code drift possible.
- The Method structure from cycle 0001 worked as designed — the
  design doc lived in `docs/design/0002-code-nav-tool/` throughout.

## What we learned

1. **Design before data is design in the dark.** The original
   code-nav design was reasonable — correct technology choice
   (tree-sitter), correct operations (outline, show, find), correct
   phasing. But it was solving a symptom. The Blacklight data
   revealed the disease: context compounding. Without that data, we
   would have shipped a nice utility that addressed ~25% of the
   problem.

2. **The Editor's Edition pattern works.** James reviewed the design
   not as "is this correct?" but as "is this ambitious enough?" The
   APPROVE/REJECT/ENHANCE framework forced a clear verdict that
   preserved the good work while upgrading the framing.

3. **Pivoting mid-design is cheap.** No code was written, no tests
   to rewrite, no sunk cost. This is exactly why The Method puts
   design before RED. The cost of this pivot was one document
   rewrite.

## New debt

None.

## Cool ideas

- **Blacklight as validation harness** — after deploying
  safe-context, re-run the Blacklight analysis to measure actual
  burden reduction. The before/after data is the ultimate playback
  witness.

## Backlog impact

Remaining work re-enters the backlog as a new item:
`DX_safe-context-phase-1.md` in `asap/`. The pivot doesn't kill the
work — it sharpens it.
