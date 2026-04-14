# Bump version to 17.0.0 in package.json and jsr.json

**Audit ref:** DQ01-C-03, SR01-R1

Both `package.json` (line 3) and `jsr.json` (line 3) still read `"version": "16.0.0"`.
The release runbook requires `package.json` version == `jsr.json` version and a dated
CHANGELOG entry. Neither condition is met. `npm run release:preflight` will hard-fail.

## Steps

1. Set `version` to `17.0.0` in `package.json`.
2. Set `version` to `17.0.0` in `jsr.json`.
3. Run `npm run release:preflight` to verify.
