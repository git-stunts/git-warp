# Release process

This file is the maintainer release runbook for `@git-stunts/git-warp`.
End-user learning material belongs in `README.md`, `ARCHITECTURE.md`,
`docs/topics/`, and `docs/operations/`. Release procedure belongs here.

## Release shape

Releases use a branch -> PR -> merge -> automated tag -> release workflow
sequence.

1. Create a release-prep branch named `release/vX.Y.Z`.
2. Prepare release content on that branch.
3. Open a normal PR to `main`; do not open a draft PR for release prep.
4. Merge the PR after review and green CI.
5. The `Release Autotag` workflow sees the merged `release/*` branch on
   `main`, runs final release preflight, creates the `vX.Y.Z` tag at the merge
   commit, and dispatches the `Release` workflow for that tag.
6. The `Release` workflow verifies publishability, publishes npm and JSR, and
   creates or updates the GitHub Release.

The tag must point at the exact `main` commit that passed the release prep PR.
Do not move existing public tags. If the wrong commit was released, cut the next
patch version from `main`.

## Release prep checklist

Before opening the release-prep PR, update every artifact whose truth changes
when diffing the previous public tag against the release branch.

Required metadata:

- `package.json` version;
- `package-lock.json` root package version;
- `jsr.json` version;
- private workspace package versions in `packages/*/package.json`.

Required release signposts:

- `CHANGELOG.md` gets a dated `## [X.Y.Z] - YYYY-MM-DD` entry.
- `README.md` updates the latest-release section when the current version or
  front-door positioning changes.
- `ARCHITECTURE.md` updates release posture when architecture, boundaries,
  ports, adapters, storage, or read model posture changes.
- `docs/topics/README.md` updates the current-release summary when the learning
  shelf changed.
- Topic docs under `docs/topics/` are updated when user-facing runtime truths
  changed.
- `docs/operations/README.md` is updated when operator workflows changed.
- `.github/CONTRIBUTING.md`, `AGENTS.md`, or this file are updated when
  contributor or maintainer process changed.

Diff review:

```bash
git fetch origin --tags
git diff --stat vPREVIOUS..HEAD
git diff --name-status vPREVIOUS..HEAD
git log --oneline vPREVIOUS..HEAD
```

Use that diff to decide which signposts need edits. Do not rely on version
bumping alone.

## Local and PR validation

Run the branch-local release guard before pushing when possible:

```bash
npm run release:prep
```

CI also runs release-prep validation on PRs. The PR preview comment reports the
package version and npm dist-tag that will be used if the release branch merges
and the autotag workflow runs.

## Automatic tagging

The `Release Autotag` workflow runs on pushes to `main`. It only proceeds when
the merged commit is associated with a PR whose head branch starts with
`release/`.

The workflow:

- reads the version from `package.json`;
- derives `vX.Y.Z`;
- skips if the tag already exists;
- runs `npm run release:preflight` from the aligned `main` commit;
- creates an annotated tag at that commit;
- dispatches `release.yml` with the tag as input.

GitHub does not reliably start another workflow from a tag push made with the
default `GITHUB_TOKEN`, so autotag dispatches the release workflow explicitly.
That dispatched workflow uses the existing-tag recovery posture, but the live
issue gates and exact-`main` checks have already run in autotag immediately
before tag creation.

## Release gates

`scripts/release-guard.sh` is the executable release law. It enforces:

- SemVer tag format with leading `v`;
- metadata lockstep across npm, JSR, lockfile, and private workspaces;
- clean worktree;
- exact `origin/main` match for final/tag stages;
- dated changelog entry;
- consolidated documentation topology;
- zero open `priority:asap` issues;
- zero open issues in the target release milestone;
- zero open issues in prior release milestones.

`scripts/release-preflight.sh` wraps the guard with lint, Markdown, link,
type, coverage, npm pack, JSR dry-run, packed-artifact smoke, and npm audit
checks.

## Manual fallback

Manual tagging is allowed only when the autotag workflow cannot run. Do not use
manual tagging to bypass failed gates.

From clean, fetched, aligned `main`:

```bash
npm run release:preflight
git tag -a vX.Y.Z -m "release: vX.Y.Z"
git push origin vX.Y.Z
```

If one registry publish fails after the tag exists, rerun the `Release`
workflow manually with the existing tag. Do not move the tag.
