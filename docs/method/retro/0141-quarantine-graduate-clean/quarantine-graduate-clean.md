# 0141 Quarantine Graduate Clean Retro

## Outcome

`REL_quarantine-graduate-clean` is closed. The broad 0025 file-level
anti-sludge quarantine manifests now have empty `files` lists, and the
release branch passes `npm run lint:quarantine-graduate` against
`origin/main`.

The remaining legacy anti-sludge hits are not gone. They are narrowed to
line-level owning-cycle suppressions and reported explicitly by
`npm run lint:semgrep` as inline suppressions.

## What Went Well

- The RED was the real release gate: `npm run lint:quarantine-graduate`
  failed before cleanup and passed afterward.
- The contamination scanner now understands explicit inline suppressions, so
  regenerated manifests reflect current file-level reality instead of old
  broad exemptions.
- The semgrep wrapper now reports manifest suppressions and inline
  suppressions separately, which makes the remaining debt count visible.

## What Was Messy

- This was intentionally mechanical and noisy: hundreds of legacy hits moved
  from broad file-level quarantine to line-level suppressions.
- It is not a semantic cleanup of every anti-sludge issue. It is release
  hygiene that prevents whole files from staying under blanket exemptions.
- Git still warns that exhaustive rename detection is skipped when computing
  the `origin/main` branch diff; the gate passes despite that warning.

## SSJS Scorecard

- Runtime-backed forms for new concepts: not applicable; this is tooling and
  suppression narrowing.
- Boundary validation stays at boundaries: pass; no production boundary model
  changes were introduced.
- Behavior lives on the owner: pass; contamination scanning and semgrep
  filtering each own their respective suppression behavior.
- No message parsing for behaviorally significant branching: pass; suppression
  parsing is tooling-only and explicit.
- No ambient time or entropy in domain code: pass.
- No fake shape trust or cast-cosplay in new production code: pass.

## Follow-Up

Pull `REL_full-gate-matrix-green` next. If the full matrix is green, the DAG
can move to release cut/version/changelog work. If it is red, that failure is
the next concrete blocker.

The 377 inline anti-sludge suppressions remain real cleanup fuel for later
0025 paydown cycles.

## Battle Report

We traded a swamp for labeled warning tape. It is still not a garden, but now
the bad ground is marked line by line instead of whole files being declared
untouchable. The next move is simple and unforgiving: run the whole matrix and
believe it.

