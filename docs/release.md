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

Run the local preflight before tagging:

```bash
npm run release:preflight
```

This script (`scripts/release-preflight.sh`) checks:

| # | Check | Blocking? |
|---|-------|-----------|
| 1 | `package.json` version == `jsr.json` version | Yes |
| 2 | Clean working tree (no uncommitted changes) | Yes |
| 3 | On `main` branch | Warning |
| 4 | CHANGELOG has a dated `[X.Y.Z] — YYYY-MM-DD` entry | Yes |
| 5 | ESLint clean | Yes |
| 6 | Type firewall (tsc + IRONCLAD policy + consumer + surface) | Yes |
| 7 | Unit tests pass | Yes |
| 8 | `npm pack --dry-run` + `jsr publish --dry-run` | Yes |
| 9 | `npm audit` (runtime deps, high/critical) | Warning |

If all checks pass, the script prints the exact tag + push commands.

## Steps

1. Prepare the release content:
   - Bump version in **both** `package.json` and `jsr.json`.
   - Move `[Unreleased]` items in `CHANGELOG.md` to a dated `[X.Y.Z] — YYYY-MM-DD` section.
   - Commit: `git commit -m "release: vX.Y.Z"`
2. Run preflight:
   ```bash
   npm run release:preflight
   ```
3. Push the release-prep branch and open a PR to `main`.
4. Merge to `main` after review and green CI.
5. Tag the release:
   - Stable: `git tag -s vX.Y.Z -m "release: vX.Y.Z"`
   - RC: `git tag -s vX.Y.Z-rc.N -m "release: vX.Y.Z-rc.N"`
6. Push the tag:
   ```bash
   git push origin vX.Y.Z
   ```
7. Watch the Actions pipeline:
   - **tag-guard** -- validates tag format (`vX.Y.Z` or `vX.Y.Z-(rc|beta|alpha).N`)
   - **CI** -- full test suite (type firewall, lint, Docker tests across Node/Bun/Deno)
   - **verify** -- version match (package.json == jsr.json == tag), CHANGELOG entry, dry-run pack, dry-run JSR
   - **publish_npm** -- publishes to npm via OIDC with provenance
   - **publish_jsr** -- publishes to JSR via OIDC
   - **github_release** -- creates GitHub Release with auto-generated notes
8. If one registry fails, re-run only that job from the Actions UI.
9. Confirm:
   - npm dist-tag is correct (`latest` for stable, `next`/`beta`/`alpha` for prereleases)
   - JSR version is visible
   - GitHub Release notes are generated

## Release notes policy

Release chronology lives in `CHANGELOG.md`.

The README no longer carries a per-release `What's New` section. Update the README only when the front-door onboarding, examples, or current product positioning materially change.

## Dist-tag mapping

| Tag pattern       | npm dist-tag              |
| ----------------- | ------------------------- |
| `vX.Y.Z-rc.N`     | `next`                    |
| `vX.Y.Z-beta.N`   | `beta`                    |
| `vX.Y.Z-alpha.N`  | `alpha`                   |
| `vX.Y.Z`          | depends — see below       |

A stable tag does **not** automatically claim `latest`. `latest` is what a bare
`npm install @git-stunts/git-warp` resolves to, so only the highest published
version may hold it. The workflow compares the tag against the registry's
current `latest`:

| Tag relative to published `latest` | npm dist-tag        |
| ---------------------------------- | ------------------- |
| at or above it                      | `latest`            |
| below it                            | `maintenance-vX`    |
| package not yet published           | `latest`            |
| registry unreadable                 | **release refuses** |

The maintenance tag is `maintenance-v16`, not `v16` or `16.x`. Both of those
parse as the semver range `>=16.0.0 <17.0.0-0`, so `npm install …@v16` would
resolve as a range and shadow the dist-tag instead of reading it.

The release refuses rather than guessing when the registry cannot be read.
Defaulting to `latest` mispublishes a back-release; defaulting to a maintenance
tag silently fails to promote a real one. Neither is recoverable once published,
and a failed release is cheap by comparison.

## Maintenance releases

`main` carries one line. When an older major still needs correctness fixes —
because a consumer cannot cross a major to pick them up — that line gets a
maintenance branch and releases from it.

The usual rule is that a release must come from a commit already on `main`.
A maintenance line cannot satisfy that by construction: `main` holds a newer
version and cannot carry an older line's bump. The **shape** of the rule is
what carries over, not the branch name — merge to the line's trunk first, tag
that trunk, never tag a PR head or a local-only commit:

1. Branch `maintenance/<major>.x` from the line's last release tag. This is the
   line's trunk; treat it exactly as `main` is treated for the current line.
2. Land fixes on it by PR, reviewed as normal.
3. Branch `release/vX.Y.Z` from that trunk. Bump `package.json`, `jsr.json`,
   the `release-policy-shape` pin, and the ROADMAP header together.
4. PR that into `maintenance/<major>.x` — **not** into `main`. A maintenance
   branch cannot merge to `main` and will show as conflicting; that is expected.
5. Merge, then tag `vX.Y.Z` on `maintenance/<major>.x` and push the tag.
6. Verify delivery from the registry, and verify the **dist-tag** as well as the
   version:

   ```bash
   npm view @git-stunts/git-warp dist-tags --json
   ```

   `latest` must still point at the current line. If a maintenance release moved
   it, fix it immediately with `npm dist-tag add`; the published version itself
   cannot be withdrawn.

Fixes that apply to both lines land on `main` first, then get backported.
A backport PR opened against `main` for review purposes only must be closed
rather than merged, and say so in its description.
