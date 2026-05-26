# V18 Release Evidence Archive

## Hill

Name the evidence that should survive after the public `v18.0.0` release,
instead of leaving it scattered across PR comments, CI logs, and local command
output.

## Context

The v18 path accumulated several classes of release evidence:

- migration wet-run reports;
- generated Continuum contract conformance;
- `warp-ttd` generated-family smoke evidence;
- closeout audit evidence for raw content/property compatibility boundaries;
- release preflight output;
- GitHub CI checks;
- npm and JSR publish output.

PR comments and CI logs are useful, but they are not a durable release ledger
by themselves. A release evidence archive should summarize the final public
facts and point back to inspectable sources.

## User Stories

- As a maintainer, I can answer "what exactly shipped in v18?" without
  replaying the whole PR history.
- As a downstream integrator, I can find the migration proof and generated
  contract evidence that justify the release claim.
- As a future release agent, I can compare v19 or v20 release evidence against
  a stable v18 pattern.

## Acceptance Criteria

- A future release archive names the tag, commit, package versions, publish
  timestamps, and registry artifacts.
- The archive links to the release-prep PR, CI run, release notes, and local
  gate evidence.
- The archive records residual raw content/property compatibility risk as an
  accepted v18 risk, not an omitted blocker.
- The archive records that full graph streaming is a later-major goal.

## Test Plan

- Markdown lint the archive.
- Link-check repository-local release evidence links.
- Compare archived package versions against `package.json` and `jsr.json`.
- Verify the archived tag SHA matches the release commit.
