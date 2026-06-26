# Release process

This file is the maintainer release runbook for `@git-stunts/git-warp`.
End-user learning material belongs in `README.md`, `ARCHITECTURE.md`,
`docs/topics/`, and `docs/operations/`. Release procedure belongs here.

## Release shape

Releases use a branch -> PR -> merge -> automated tag -> manual registry
publish sequence.

1. Create a release-prep branch named `release/vX.Y.Z`.
2. Prepare release content on that branch.
3. Open a normal PR to `main`; do not open a draft PR for release prep.
4. Merge the PR after review and green CI.
5. The `Release Autotag` workflow sees the merged `release/*` branch on
   `main`, runs final release preflight, creates the `vX.Y.Z` tag at the merge
   commit, and prints the manual publish command.
6. A maintainer whose GitHub account is a JSR `@git-stunts` scope member
   manually dispatches the `Release` workflow for that tag.
7. The `Release` workflow verifies publishability, publishes npm and JSR, and
   creates or updates the GitHub Release.

The tag must point at the exact `main` commit that passed the release prep PR.
Do not move existing public tags. If the wrong commit was released, cut the next
patch version from `main`.

## Release thesis

Every planned, versioned release must have a thesis before implementation work
starts against that milestone.

The thesis is one short paragraph that answers why the release exists. It must
name the capability boundary being advanced, the primary user or operator
outcome, and the work that is explicitly outside the release. Put the thesis in
the GitHub Milestone description or in a linked tracking issue before marking
release issues `status:active`.

Use GitHub Milestones for version buckets. Do not create version labels for
release targeting. Labels remain query axes: `type:*`, `priority:*`,
`status:*`, and `area:*`.

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
and the autotag workflow creates the tag.

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
- prints the manual `release.yml` dispatch command.

GitHub does not reliably start another workflow from a tag push made with the
default `GITHUB_TOKEN`. JSR also treats workflows dispatched by
`github-actions[bot]` differently from workflows dispatched by a GitHub user who
is a JSR scope member. For now, autotag stops after tag creation. A maintainer
dispatches the release workflow manually so JSR OIDC publishing runs under a
scope-member actor.

## Manual registry publication

After autotag creates `vX.Y.Z`, a maintainer whose GitHub account is a JSR
`@git-stunts` scope member must dispatch the release workflow:

```bash
gh workflow run release.yml --ref main -f tag=vX.Y.Z
```

Watch the run:

```bash
gh run list --workflow release.yml --limit 5
gh run watch <RUN_ID> --exit-status --interval 30
```

Verify both registries:

```bash
npm view @git-stunts/git-warp@X.Y.Z version --registry=https://registry.npmjs.org
npm view @jsr/git-stunts__git-warp@X.Y.Z version --registry=https://npm.jsr.io
```

Do not move the tag if either registry fails. Fix the registry-specific problem
and rerun the release workflow or the failed job.

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

## Post-release retrospective

Run a retrospective immediately after the release tag, GitHub Release, registry
publication, and visibility checks are complete. Do not start the next planned
release train until the retrospective exists.

The retrospective must record:

- what was released, including user-facing behavior, runtime/API changes, docs,
  release tooling, dependency changes, and registry evidence;
- what did not get released, including planned items moved forward, blocked
  items, intentional cuts, and accidental omissions;
- plan-versus-actual scope, including what shipped, slipped, expanded, or
  changed direction and why;
- three to five things that went well and why they are repeatable;
- three to five things to improve and the concrete mitigation for each;
- fallout GitHub Issues for bad code, cool ideas, process gaps, missing docs,
  release automation gaps, or follow-up validation.

Every fallout issue must explain why it matters, cite the evidence that proved
it, name the release bucket when it belongs to one, and define what done looks
like. Apply exactly one label from each live issue axis and use milestones for
release targeting.

## Next-release planning

After the retrospective, prep the next release deliberately:

1. Close the completed release milestone when all scoped issues are closed.
2. Keep empty patch milestones only as patch buckets; do not treat an empty
   patch milestone as the next feature train.
3. Triage open GitHub Issues into milestones and label axes.
4. Choose the next versioned milestone and write or refresh its thesis.
5. Define must-ship, may-slip, and explicitly-not-included scope.
6. Break the milestone into two to five goalposts with acceptance evidence.
7. Promote the first goalpost's issues to `priority:next`.
8. Mark exactly one active slice or tracking issue `status:active`.
9. Update release signposts only where the new thesis changes public or
   maintainer truth.

No release-prep PR should be opened for a planned version whose milestone lacks
a thesis.

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
workflow manually with the existing tag from a maintainer account that satisfies
registry identity requirements. Do not move the tag.
