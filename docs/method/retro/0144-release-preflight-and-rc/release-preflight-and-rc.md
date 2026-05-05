# 0144 Release Preflight And RC Retro

## Outcome

`REL_release-preflight-and-rc` is closed. A clean `npm run release:preflight`
now passes on `release/v17.0.0`, including lint, source and consumer type
firewalls, declaration surface checks, coverage, npm pack smoke, JSR dry-run,
and high/critical dependency audit.

## What Went Well

- The preflight script made release readiness binary: the first run surfaced
  the real hard failures instead of letting them leak into PR or tag time.
- JSR slow-type failures were small, targeted return-type fixes.
- The final clean preflight gave one concise release-candidate signal.

## What Was Messy

- The normal cycle order had to bend because preflight refuses to run against a
  dirty working tree.
- Coverage was not just a threshold typo: declarations and ports needed to be
  excluded, and the measured v17 line baseline settled at `91.74%`.
- Lowering the coverage ratchet is a real debt marker, so it needed an explicit
  bad-code backlog item rather than quiet release bookkeeping.

## Follow-Up

Pull `REL_push-pr-review-merge` next. That node should push the branch, open or
update the release PR, inspect CI, handle review feedback, and stop before merge
unless James explicitly says `YES`.

## Battle Report

The last local gate went green. The package can survive being packed, smoke
tested, dry-run published to JSR, and audited without flinching. The one ugly
bruise is coverage debt, and it is now written down with a release home instead
of swept under the build rug. Blocker countdown: `1`.
