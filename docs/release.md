# Release Runbook

## Prerequisites

- You have push access to `main` and can create tags.
- GitHub environments `npm` and `jsr` are configured with appropriate secrets/OIDC.
- `NPM_TOKEN` secret is set in the `npm` environment.

## Steps

1. Update `package.json` and `jsr.json` versions to the target version.
2. Merge to `main` (all checks green).
3. Tag the release:
   - Stable: `git tag -s vX.Y.Z -m "release: vX.Y.Z"`
   - RC: `git tag -s vX.Y.Z-rc.N -m "release: vX.Y.Z-rc.N"`
4. Push the tag:
   ```bash
   git push origin vX.Y.Z
   ```
5. Watch the Actions pipeline:
   - **verify** -- lint, test, version match, dry-run pack
   - **publish_npm** -- publishes to npm with provenance
   - **publish_jsr** -- publishes to JSR
   - **github_release** -- creates GitHub Release with auto-generated notes
6. If one registry fails, re-run only that job from the Actions UI.
7. Confirm:
   - npm dist-tag is correct (`latest` for stable, `next`/`beta`/`alpha` for prereleases)
   - JSR version is visible
   - GitHub Release notes are generated

## Dist-tag mapping

| Tag pattern       | npm dist-tag |
| ----------------- | ------------ |
| `vX.Y.Z`          | `latest`     |
| `vX.Y.Z-rc.N`     | `next`       |
| `vX.Y.Z-beta.N`   | `beta`       |
| `vX.Y.Z-alpha.N`  | `alpha`      |
