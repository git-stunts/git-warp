# Cycle 0010 Retro — 100% Code Coverage

**Date:** 2026-04-06
**Type:** Debt
**Outcome:** Partial

## What happened

Cycle 0010 started as a pure coverage push and became a much larger
honesty pass over the repo's test surface.

The cycle did four substantive things:

- installed the FULL-COVERAGE invariant and an enforceable Vitest
  threshold
- covered the previously untested controller layer
- drove the largest risk files (`StrandService`,
  `ConflictAnalyzerService`, `WarpApp`, `WarpCore`, `WarpRuntime`) under
  executable spec
- converted the remaining hard misses into explicit backlog items when
  the uncovered lines turned out to be environment-coupled, dead after
  normalization, or otherwise not worth gaming with fake tests

The initial line baseline in the design doc was **85.46%**.
The branch closes at **97.66%** line coverage with **6462** tests
passing.

## Drift check

- The design hill named "100% Code Coverage", but the actual shipped
  outcome is a natural-break partial close at 97.66%. This drift is
  documented explicitly here and in the design doc status.
- The original ratchet implementation auto-updated thresholds during
  targeted coverage runs. That behavior was wrong for the claimed
  invariant. The cycle corrected it so only global
  `npm run test:coverage` updates the threshold.
- The cycle widened from "controllers and giants" into a broader
  repo-wide residue sweep. That expansion was still in-bounds because it
  served the same playback questions, but it should be named as scope
  growth rather than pretended away.

## Playback

### Agent

- Does `vitest --coverage` report 100% line coverage?
  - **NO.** The final global witness is 97.66% lines.
- Is there a CI-enforceable threshold that prevents regression?
  - **YES.** `npm run test:coverage` ratchets the checked-in Vitest
    threshold, and targeted runs do not mutate it.
- Are the untested giants now covered?
  - **YES.** Controllers, `StrandService`, `ConflictAnalyzerService`,
    `WarpApp`, `WarpCore`, and `WarpRuntime` all received substantial
    direct coverage.
- Do the new tests verify behavior, not implementation?
  - **YES, mostly.** The surviving misses were backlogged instead of
    papered over. That kept the suite behavior-first rather than
    turning it into reachability theater.

### Human

- Do the tests catch real bugs?
  - **YES.** The cycle caught and fixed the ratchet bug where targeted
    coverage runs rewrote the global threshold. It also surfaced
    multiple dead or misleading defensive branches that are now tracked
    as debt instead of silently blessed.
- Is the coverage number honest (no `/* v8 ignore */` cheats)?
  - **YES.** The branch closes with no ignore suppressions added for the
    remaining residue. Opaque or unreachable branches were documented in
    the backlog instead.

## Witness

Primary witness command:

```bash
npm run test:coverage
```

Closing witness result:

- `6462` tests passing
- `97.66%` line coverage
- checked-in threshold updated by the global coverage run only

Supporting witness:

```bash
git log --oneline --decorate -25
```

This shows the cycle as a sequence of small, reviewable commits rather
than one monolith: ratchet installation and fix, heavy-service coverage,
residue backlogging, and final coverage sweeps.

## What went well

- The controller tranche gave a fast early rise and made the later
  heavyweight work cheaper.
- Coverage-first before refactor was the right call. Tests now pin the
  behavior of the gods before the decomposition cycle starts.
- Backlogging residue instead of gaming the numbers kept the metric
  honest.
- Several follow-on decomposition items are now much better scoped
  because the tests exposed the real phase boundaries.

## What went wrong

- The cycle name anchored expectations around literal 100%, but the
  honest stopping point was lower.
- Some late-cycle effort went into diminishing-return residue rather
  than earlier explicit recognition that certain misses were loader or
  environment opacity.
- The existing PR title/body drifted far behind the real branch scope.

## New debt

This cycle surfaced a large residue trail. The important pattern is
consistent:

- import-time / environment-coupled fallback branches
- defensive tails after exhaustive normalization
- service god-object boundaries now obvious under test

Those misses were logged individually in `docs/method/backlog/bad-code/`
rather than hidden.

## Cool ideas

- Coverage cycles are good X-ray cycles. They expose the real future
  decomposition boundaries more honestly than up-front architecture
  guesses.
- The visualization surface should probably be cut from git-warp and
  consolidated into `warp-ttd`, leaving git-warp focused on substrate
  truth and operator-facing data surfaces.

## Backlog maintenance

- Added multiple `bad-code` items for dead, opaque, or misleading
  residue branches
- Added `asap` decomposition items for `ConflictAnalyzerService`,
  `StrandService`, and `DagPathFinding`
- Added a new `asap` item to cut git-warp's visualization surface in
  favor of `warp-ttd`

## Recommendation

Close cycle 0010 as **partial but successful**:

- the invariant is real
- the largest risk files are now covered
- the remaining distance to 100% is mostly explicit residue, not blind
  unknowns

The next cycle should switch modes: refactor the gods behind the new
tests instead of squeezing ever-smaller coverage residue.
