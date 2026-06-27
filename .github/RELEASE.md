# Release process

This file is the repo-specific release runbook for `@git-stunts/git-warp`.
It implements the Continuum Release Contract using the release profile in
`.continuum/release.yml`.

End-user learning material belongs in `README.md`, `ARCHITECTURE.md`,
`docs/topics/`, and `docs/operations/`. Release procedure belongs here.

## Continuum Release Contract

A release is valid only when:

1. It has a reason. Planned releases require a thesis before implementation
   scope becomes active.
2. It has a bucket. Version-targeted work uses a GitHub Milestone, not version
   labels.
3. It has honest scope. Must-ship, may-slip, and explicitly-not-included work
   are recorded.
4. It has one source commit. The release tag points at the exact reviewed
   `main` commit.
5. It has an immutable public tag. Public tags are not moved; bad releases are
   fixed by patching forward.
6. It has synchronized metadata. All declared version sources agree.
7. It has updated signposts. Changelog, front-door docs, architecture,
   operations, and maintainer docs change when their truth changes.
8. It passes executable gates. Release rules live in scripts and workflows, not
   only prose.
9. It publishes from the tag. Registry artifacts are produced from tagged
   source with actor and provenance requirements satisfied.
10. It is verified after publication. Registry or deploy visibility and smoke
    checks are recorded.
11. It leaves evidence. Tag, commit, workflow run, artifact, and verification
    evidence are captured.
12. It creates learning. Every planned release ends with a retrospective and
    fallout issues.

## Repo Release Profile

Repo-specific release facts live in `.continuum/release.yml`:

- version sources;
- tag, release branch, and milestone formats;
- required docs and signposts;
- local validation commands;
- registry packages and verification commands;
- workflow names;
- publish actor requirements.

Do not duplicate those facts into new prose when automation can read the
profile. Change the profile when the repo-specific mechanics change, then
update this runbook only when the human procedure changes.

## Release State Machine

Releases move through a standard lifecycle:

1. `planned`: milestone exists with a thesis, scope, and goalposts.
2. `active`: exactly one slice or tracking issue is `status:active`.
3. `release-prep`: a `release/vX.Y.Z` branch and normal PR exist.
4. `merged`: the release-prep PR has landed on `main`.
5. `tagged`: the immutable `vX.Y.Z` tag points at the reviewed `main` commit.
6. `published`: registries accepted or already contain the artifact.
7. `verified`: public visibility and smoke checks passed.
8. `retrospectived`: evidence, lessons, and fallout issues are recorded.
9. `closed`: the milestone is closed and the next release is planned.

For this repo, the default flow is branch -> PR -> merge -> automated tag ->
manual registry publish:

1. Create a release-prep branch named `release/vX.Y.Z`.
2. Prepare release content on that branch.
3. Open a normal PR to `main`; do not open a draft PR for release prep.
4. Merge the PR after review and green CI.
5. The `Main Push Release Branch Check` workflow runs on the merge commit,
   proves the commit came from a release-prep PR, runs final preflight, creates
   the `vX.Y.Z` tag at that exact commit, and prints the manual publish command.
6. A maintainer whose GitHub account is a JSR `@git-stunts` scope member
   manually dispatches the `Release` workflow for that tag.
7. The `Release` workflow checks out the tag, verifies publishability,
   publishes npm and JSR, and creates or updates the GitHub Release.

Do not move existing public tags. If the wrong commit was released, cut the
next patch version from `main`.

## Release Types

### Planned Release

Planned minor and major releases require a milestone thesis, scoped issues,
goalposts, full validation, publication evidence, and a full retrospective.

### Patch Release

Patch releases require a short patch thesis, a changelog entry, validation,
publication evidence, and at least a lightweight retrospective in the release
tracking issue.

Patch milestones are parking lots for maintenance opportunities, not feature
trains. A patch milestone becomes active only when it has a patch thesis and at
least one must-ship fix.

### Emergency Release

Emergency releases may begin from a private or abbreviated tracking issue. They
must complete the missing planning, evidence, and retrospective record
immediately after publication.

### Security Release

Security releases may use private advisory tracking before publication. Public
release notes must avoid exploit-enabling detail until disclosure is approved.

### Prerelease

Prereleases use SemVer prerelease versions and non-`latest` dist-tags. They
must not update stable latest-release signposts unless promoted.

## Version Selection

Use `PATCH` for compatible bug fixes, docs corrections that accompany behavior
already present, packaging fixes, and non-breaking operational improvements.

Use `MINOR` for new compatible capabilities, new public commands, new
supported workflows, or meaningful user-facing enhancements.

Use `MAJOR` for breaking public API, CLI, runtime behavior, storage format,
config format, migration burden, or support boundary changes.

Prereleases use `X.Y.Z-alpha.N`, `X.Y.Z-beta.N`, or `X.Y.Z-rc.N` and must not
publish to the stable dist-tag.

For `git-warp`, breaking changes include exported API or type removals, package
entrypoint changes, CLI flag or output incompatibilities, structured error code
changes, storage or WARP ref format incompatibilities, and runtime support
boundary changes.

## Dist-Tag Policy

- Stable SemVer releases publish to `latest`.
- Alpha prereleases publish to `alpha`.
- Beta prereleases publish to `beta`.
- Release candidates publish to `next`.
- Maintenance releases for old majors require an explicit maintenance tag
  policy before publication.
- The release workflow must print the intended dist-tag before publication.

## Release Thesis

Every planned, versioned release must have a thesis before implementation work
starts against that milestone.

The thesis is one short paragraph that answers:

- why the release exists;
- what capability boundary moves;
- who benefits;
- what outcome they should see;
- what is explicitly out of scope.

Put the thesis in the GitHub Milestone description or in a linked tracking
issue before marking release issues `status:active`.

Use GitHub Milestones for version buckets. Do not create version labels for
release targeting. Labels remain query axes: `type:*`, `priority:*`,
`status:*`, and `area:*`.

## Scope Reconciliation

Before opening a release-prep PR, reconcile the milestone:

- close completed issues;
- move slipped issues to the next correct milestone;
- mark intentional cuts with rationale;
- confirm must-ship scope is complete;
- confirm may-slip scope has either shipped or moved;
- confirm explicitly-not-included scope did not sneak in;
- confirm prior release milestones have no unresolved work;
- confirm no `priority:asap` issue blocks the release.

Allowed open items in the target milestone before tagging are limited to
approved release-operations issues, such as the release tracking issue.
Everything else must be closed, moved, or cut.

## Release Prep Checklist

Before opening the release-prep PR, update every artifact whose truth changes
when diffing the previous public tag against the release branch.

Required metadata comes from `.continuum/release.yml`. For the current profile,
that includes:

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
- `.github/CONTRIBUTING.md`, `AGENTS.md`, `.continuum/release.yml`, or this
  file are updated when contributor or maintainer process changed.

Diff review:

```bash
git fetch origin --tags
git diff --stat vPREVIOUS..HEAD
git diff --name-status vPREVIOUS..HEAD
git log --oneline vPREVIOUS..HEAD
```

Use that diff to decide which signposts need edits. Do not rely on version
bumping alone.

## Local and PR Validation

Run the branch-local release guard before pushing when possible:

```bash
npm run release:prep
```

CI also runs release-prep validation on PRs. The PR preview comment reports the
package version and npm dist-tag that will be used if the release branch merges
and the main-push release branch check creates the tag.

## Automatic Tagging

The `Main Push Release Branch Check` workflow runs on pushes to `main`. It only
proceeds when the pushed commit is associated with a merged release-prep PR. The
PR must come from a `release/vX.Y.Z` branch.

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
is a JSR scope member. For now, the main-push release branch check stops after
tag creation. A maintainer dispatches the release workflow manually so JSR OIDC
publishing runs under a scope-member actor.

## Manual Registry Publication

After the main-push release branch check creates `vX.Y.Z`, a maintainer whose
GitHub account is a JSR `@git-stunts` scope member must dispatch the release
workflow:

```bash
gh workflow run release.yml --ref vX.Y.Z -f tag=vX.Y.Z
```

The release workflow checks out the input tag and fails unless the checked-out
commit equals the tag commit. Dispatching from the tag keeps the workflow
definition and release source aligned.

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

## Release Gates

`scripts/release-guard.sh` is the executable release law. It enforces:

- SemVer tag format with leading `v`;
- metadata lockstep across npm, JSR, lockfile, and private workspaces;
- clean worktree;
- exact `origin/main` match for final/tag stages;
- dated changelog entry;
- release profile and consolidated documentation topology;
- zero open `priority:asap` issues;
- zero open non-release-operation issues in the target release milestone;
- zero open issues in prior release milestones.

`scripts/release-preflight.sh` wraps the guard with lint, Markdown, link,
type, coverage, npm pack, JSR dry-run, packed-artifact smoke, and npm audit
checks.

## Idempotency

Release workflows must be safe to rerun for an existing public tag.

A rerun may:

- verify an already-published registry artifact;
- publish to a registry that has not yet received the version;
- update the GitHub Release notes for the same tag;
- re-run post-publish verification.

A rerun must not:

- move the tag;
- rebuild a different artifact for the same version;
- overwrite an existing registry version with different contents;
- silently change the intended dist-tag.

## Failure Handling

### Tag Created, npm Publish Failed

Do not move the tag. Fix the npm-specific issue and rerun the release workflow
for the same tag.

### npm Published, JSR Failed

Do not move the tag. Fix the JSR-specific issue and rerun the release workflow
for the same tag from a JSR scope-member maintainer account.

### Registry Published Bad Package

Do not move the tag. Deprecate, yank, or annotate the registry artifact only
when registry policy and maintainer judgment allow it. Cut the next patch
release from `main`.

### GitHub Release Notes Are Wrong

Update the GitHub Release for the same tag. Do not retag.

### Wrong Commit Tagged But Not Published

If a tag has not left the repo boundary and no public consumers can observe it,
maintainers may delete and recreate it only under a documented private-recovery
decision. Once public, patch forward.

### Credentials or Provenance Failure

Stop publication, rotate or fix identity, then rerun from the same tag.

## Release Evidence

Record release evidence in the release tracking issue or retrospective:

- tag name and commit SHA;
- GitHub Release URL;
- GitHub Actions release run URL;
- package version;
- npm package URL or `npm view` output;
- JSR package URL or verification output;
- npm pack artifact summary;
- provenance or attestation status, when available;
- smoke install, CLI, or import result;
- changelog entry link.

The release is not done when publication succeeds. The release is done when
visibility and usability are verified.

## Post-Release Retrospective

Run a retrospective immediately after the release tag, GitHub Release, registry
publication, and visibility checks are complete. Do not start the next planned
release train until the retrospective exists.

Use this structure:

```text
# Release retrospective: vX.Y.Z

## Released
## Not released
## Plan vs actual
## Evidence
- tag:
- commit:
- release run:
- registry evidence:
- smoke evidence:
## Went well
## Improve next time
## Fallout issues
## Next release recommendation
```

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

## Next-Release Planning

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

## Manual Fallback

Manual tagging is allowed only when the main-push release branch check cannot
run. Do not use manual tagging to bypass failed gates.

From clean, fetched, aligned `main`:

```bash
npm run release:preflight
git tag -a vX.Y.Z -m "release: vX.Y.Z"
git push origin vX.Y.Z
```

If one registry publish fails after the tag exists, rerun the `Release`
workflow manually with the existing tag from a maintainer account that satisfies
registry identity requirements. Do not move the tag.
