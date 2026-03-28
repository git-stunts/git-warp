# 2026-03-28 Retrospective: README Theory Balance

**Design:** `docs/design/public-api-design-thinking.md`, `docs/design/readme-warp-positioning-and-fit.md`, `docs/design/readme-progressive-disclosure-intro.md`

## What Landed

- The local README drift toward theory-first and slogan-heavy framing was cut
  back.
- The top matter now stays practical again: install CTA, product description,
  fit, mental model, and quick-start path remain intact.
- The `What Is WARP?` section kept one additional explanatory paragraph about
  state being derived from causal history, but linked deeper theory back out to
  AIΩN instead of expanding into manifesto prose.
- Decorative additions that pulled focus away from onboarding were removed from
  the README.

## Design Alignment Audit

- README stays first-use oriented before deep theory: aligned
- WARP is distinguished from Git without turning the README into a paper:
  aligned
- theory remains linked rather than inlined excessively: aligned
- sponsor human and sponsor agent both still get the same practical teaching
  order: aligned

## Drift

- The README still contains a large amount of advanced material later in the
  file because `git-warp` is a broad substrate package.

## Why The Drift Happened

- The active IBM cycle already improved the early README substantially, so the
  remaining local edits that reintroduced theory-heavy top matter stood out
  immediately against the intended teaching order.

## Resolution

- Accept the trimmed README as the correct direction.
- Keep deeper theory in AIΩN and in lower README sections, not in the opening
  onboarding path.
