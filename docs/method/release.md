# Release Runbook

## First-time setup

Both registries use OIDC trusted publishing -- no stored tokens.

### npm

1. Publish the first version locally:
   ```bash
   npm login
   npm publish --access public
   ```
2. On [npmjs.com](https://www.npmjs.com): package settings → Trusted Publisher → GitHub Actions.
   - Organization/user: `git-stunts`
   - Repository: `git-warp`
   - Workflow filename: `release.yml`
3. On GitHub: create an environment called `npm` (no secrets needed).

### JSR

1. Publish the first version locally:
   ```bash
   npx jsr publish
   ```
2. On [jsr.io](https://jsr.io): package settings → link the GitHub repository.
3. On GitHub: create an environment called `jsr` (no secrets needed).

## Prerequisites

- You have push access to `main` and can create tags.
- GitHub environments `npm` and `jsr` exist (OIDC -- no secrets required).
- npm and JSR trusted publisher connections are configured (see above).

## Preflight checklist

Run the final local preflight from aligned `main` before tagging:

```bash
npm run release:preflight
```

This script (`scripts/release-preflight.sh`) checks:

| #   | Check                                                                 | Blocking? |
| --- | --------------------------------------------------------------------- | --------- |
| 1   | `scripts/release-guard.sh` release policy gates                       | Yes       |
| 2   | `package.json` version == `jsr.json` version                          | Yes       |
| 3   | Clean working tree (no uncommitted changes)                           | Yes       |
| 4   | Tag commit matches `origin/main`                                      | Yes       |
| 5   | CHANGELOG has a dated `[X.Y.Z] - YYYY-MM-DD` entry                    | Yes       |
| 6   | ESLint, Markdown lint, Markdown code samples, and link checks pass     | Yes       |
| 7   | Type firewall (source, test, policy, consumer, generated npm surface) | Yes       |
| 8   | Unit tests and coverage thresholds pass                               | Yes       |
| 9   | `npm pack --dry-run` + packed artifact smoke + `jsr publish --dry-run` | Yes       |
| 10  | `npm audit` has no high/critical runtime vulnerabilities              | Yes       |

If all checks pass, the script prints the exact tag + push commands.

## Tag-time release law

No public release tag may be created unless all automated and human evidence
gates below are satisfied. A failed automated gate is release-blocking. A human
review gate is release-blocking until the reviewer records either an update or
an explicit "reviewed, no change" disposition in the release evidence packet.

### Automated gates

The executable gate is:

```bash
npm run release:guard -- --tag vX.Y.Z
```

The guard must pass locally before tagging and in the release workflow before
publishing. It enforces:

| Gate | Rule |
| --- | --- |
| `REL-GH-ASAP-ZERO` | There are zero open GitHub Issues labeled `lane:asap`. |
| `REL-GH-TARGET-LANE-ZERO` | There are zero open GitHub Issues in the target version lane, such as `lane:v18.0.0`. |
| `REL-GH-PRIOR-RELEASE-ZERO` | There are zero open GitHub Issues with `release-home:` labels lower than the target version. |
| `REL-META-VERSION-LOCKSTEP` | Root `package.json`, `jsr.json`, `package-lock.json`, and private workspace package versions all match the tag version. |
| `REL-GIT-CLEAN` | The worktree has no unstaged or staged-but-uncommitted changes. |
| `REL-GIT-ORIGIN-MAIN` | The tag commit is exactly `origin/main`. |
| `REL-DOC-CHANGELOG-DATED` | `CHANGELOG.md` has a dated entry for the tag version. |
| `REL-DOC-EVIDENCE` | `docs/releases/vX.Y.Z/README.md` exists and contains the required release evidence sections, deterministic reproducibility record, and documentation review matrix. |

The release workflow also runs lint, Markdown lint, link checks, type gates,
consumer and declaration-surface checks, and coverage tests before any registry
publish job starts.

### Human review gates

Automation can prove structure. It cannot prove that release prose tells the
truth. Every release evidence packet must record human review for:

- `CHANGELOG.md` accurately reflects the diff since the previous public tag.
- `README.md` is updated if front-door positioning, install, examples, or
  release status changed.
- `TECHNICAL_TEARDOWN.md` is updated if the technical overview, public API
  surface, workflow, or substrate explanation changed.
- `docs/ARCHITECTURE.md` is updated if public/core boundaries, ports,
  adapters, storage model, or architecture posture changed.
- Product docs from `docs/README.md` are updated as needed:
  `docs/GETTING_STARTED.md`, `docs/READINGS_AND_OPTICS.md`,
  `docs/GUIDE.md`, `docs/API_REFERENCE.md`, `docs/PUBLIC_API_COSTS.md`,
  `docs/ADVANCED_GUIDE.md`, `docs/CLI_GUIDE.md`,
  `docs/CONCEPTUAL_OVERVIEW.md`, migration docs, specs, and trust docs.
- `docs/ROADMAP.md` and `docs/BEARING.md` match the release posture.
- Every landed release goalpost contributing to this version is named with its
  issue, doc, landed PRs, completed slice count, deterministic proof matrix,
  canonical fixtures or immutable inputs, witnesses, replay commands, and
  residual-risk disposition.
- Any accepted residual risk is named with rationale, owner, and follow-up
  issue. Hidden accepted failures are not allowed.

### Deterministic reproducibility

Evidence is not complete unless it can be replayed deterministically by another
operator from the committed release packet, the tag commit, and named immutable
inputs. A witness proves what happened during release validation; it is not
enough by itself when the input that produced it is missing or mutable.

Every release evidence packet must record:

- The exact command, script, or workflow that produced each witness.
- The canonical fixture or immutable input used by that command, when the claim
  depends on more than repository state at the tag commit.
- The expected stable result, normalized output, or digest that a replay must
  reproduce.
- Any normalization applied for host-specific noise such as temp paths, clocks,
  ordering, process IDs, registry timestamps, or environment-specific absolute
  paths.

Canonical fixtures are required when evidence depends on graph topology, stored
Git objects, package artifact contents, migration inputs, CLI transcripts,
large-graph or performance fixtures, generated docs, reproduced bugs, or any
other data shape that cannot be reconstructed uniquely from the tag commit. Put
release-specific fixtures under `docs/releases/vX.Y.Z/fixtures/` unless an
existing committed fixture is already canonical. Pair each fixture with at least
one witness that names the replay command and the expected deterministic result.

Use [release-evidence-template.md](../checklists/release-evidence-template.md)
for the committed evidence packet.

Use [roadmap-planning.md](roadmap-planning.md) for the formal goalpost,
proof-story, slice-budget, and deterministic proof contract.

## Steps

1. Prepare the release content:
   - Bump version in **both** `package.json` and `jsr.json`.
   - Bump private workspace package versions in `packages/*/package.json`.
   - Move `[Unreleased]` items in `CHANGELOG.md` to a dated `[X.Y.Z] — YYYY-MM-DD` section.
   - Fill `docs/releases/vX.Y.Z/README.md` from the release evidence template.
   - Commit: `git commit -m "release: vX.Y.Z"`
2. Run preflight:
   ```bash
   npm run release:preflight
   ```
3. Push the release-prep branch and open a PR to `main`.
4. Merge to `main` after review and green CI.
5. Fast-forward local `main`, fetch `origin/main`, and rerun final preflight
   from the exact commit to tag:
   ```bash
   git fetch origin main
   npm run release:preflight
   ```
6. Tag the release:
   - Stable: `git tag -s vX.Y.Z -m "release: vX.Y.Z"`
   - RC: `git tag -s vX.Y.Z-rc.N -m "release: vX.Y.Z-rc.N"`
7. Push the tag:
   ```bash
   git push origin vX.Y.Z
   ```
8. Watch the Actions pipeline:
   - **tag-guard** -- validates tag format (`vX.Y.Z` or `vX.Y.Z-(rc|beta|alpha).N`)
   - **CI** -- full test suite (type firewall, lint, Docker tests across Node/Bun/Deno)
   - **verify** -- release guard, tests, docs gates, version match, CHANGELOG entry, dry-run pack, dry-run JSR
   - **publish_npm** -- publishes to npm via OIDC with provenance
   - **publish_jsr** -- publishes to JSR via OIDC
   - **github_release** -- creates GitHub Release with auto-generated notes
9. If one registry fails, re-run only that job from the Actions UI.
   - If a rerun cannot use the fixed workflow from `main`, run the **Release** workflow manually with the existing tag. The workflow is idempotent: already-published registry versions are skipped, missing registry versions are published, and existing GitHub Release notes are updated with the current registry summary.
10. Confirm:
   - npm dist-tag is correct (`latest` for stable, `next`/`beta`/`alpha` for prereleases)
   - JSR version is visible
   - GitHub Release notes are generated

## Release notes policy

Release chronology lives in `CHANGELOG.md`.

The README no longer carries a per-release `What's New` section. Update the README only when the front-door onboarding, examples, or current product positioning materially change.

## Dist-tag mapping

| Tag pattern      | npm dist-tag |
| ---------------- | ------------ |
| `vX.Y.Z`         | `latest`     |
| `vX.Y.Z-rc.N`    | `next`       |
| `vX.Y.Z-beta.N`  | `beta`       |
| `vX.Y.Z-alpha.N` | `alpha`      |
