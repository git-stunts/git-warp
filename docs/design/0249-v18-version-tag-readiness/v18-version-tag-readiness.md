# V18 Version And Tag Readiness

## Hill

Prepare release metadata for `v18.0.0` without cutting the public tag from a
feature branch.

## Why

The release-candidate packet and operator notes already describe the v18
promise. The remaining package metadata had still identified the branch as
`17.0.1`, which meant release preflight could not prove version agreement for
the intended public tag.

This slice turns version readiness into explicit branch evidence while keeping
the actual tag and publish steps reserved for merged `main`.

## Scope

This slice updates:

- root `package.json`;
- private workspace `package.json` files;
- `package-lock.json`;
- `jsr.json`;
- `CHANGELOG.md`;
- `docs/BEARING.md`;
- the v18 public-release blocker ledger.

It does not create a tag, publish an artifact, or claim that GitHub CI has
already passed for the final PR branch.

## Design

The version source of truth remains boring and inspectable:

- npm package metadata reports `18.0.0`;
- JSR metadata reports `18.0.0`;
- the lockfile root and private workspace entries report `18.0.0`;
- the changelog has a dated `18.0.0` entry;
- public release notes still instruct operators to tag only after merge to
  `main`.

Private workspace package versions are aligned even though those packages are
not public publish targets. Keeping them aligned removes an avoidable
review-time ambiguity in the lockfile and makes the release branch easier to
audit.

## Acceptance Criteria

- `package.json`, `jsr.json`, and `package-lock.json` agree on `18.0.0`.
- Private workspace manifests agree on `18.0.0`.
- `CHANGELOG.md` contains a dated `18.0.0` section.
- `docs/BEARING.md` marks slice 101 complete and keeps tag/publish work
  explicitly pending until merged `main`.
- No public tag is created from this branch.

## Test Plan

- Inspect package and workspace metadata with a JSON reader.
- Run markdown lint on the edited docs.
- Run `git diff --check`.
- Run the final release preflight in the next slice after committing this
  metadata, because preflight requires a clean working tree.
