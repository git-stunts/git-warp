# 0143 Release Cut Version Changelog Retro

## Outcome

`REL_release-cut-version-changelog` is closed. The package versions already
matched at `17.0.0`, so the slice moved the release chronology to the actual
May 5 cut and tightened the v17 release note around public read-contract
honesty.

## What Went Well

- The release runbook made the package-version and changelog-date checks easy
  to target.
- No production code was needed.
- The 0123 bounded-query decision gave a clear release-note boundary.

## What Was Messy

- `CHANGELOG.md` already had an older draft `17.0.0` heading, so the release
  cut needed chronology cleanup rather than a simple new section.
- The v17 release README still carried an older streaming-ORSet headline that
  overemphasized substrate work instead of the public read contract.
- Full preflight cannot be honestly run inside this slice until these release
  edits are committed, because preflight requires a clean working tree.

## Follow-Up

Pull `REL_release-preflight-and-rc` next.

## Battle Report

The blocker board is down to release machinery. We stopped promising more than
v17 actually ships, put the date on the package story, and left the next gate
with one clean job: run the release preflight from a clean commit.
