# Docker Test Images From Tracked Files Only

Status: implemented; release and merge state live in the linked issue and PR.

Version boundary: none. Developer tooling only; no package, API or storage change.

Decision owner: git-warp maintainers

Parent tracker: [GitHub Issue #1047](https://github.com/git-stunts/git-warp/issues/1047)

## Problem

Every test and benchmark runs in a COPY-based Docker container.
Before this change, `scripts/run-in-docker.sh` handed off to
`scripts/RunDockerTestContainer.sh`, which ran `docker compose run --build` on
the `test` service in `docker/docker-compose.yml` with `context: ..`.
`docker/Dockerfile.node22-slim` copies source with `COPY . .`.

The image received **the whole working directory**, filtered only by
`.dockerignore`. Git's view of the checkout played no part:

| Host file | In Git's view | In the test image before this change |
| --- | --- | --- |
| Tracked file, edited but unstaged | the change under test | yes |
| New file, staged | the change under test | yes |
| Untracked file (scratch, probe, tool output) | not part of the change | **yes** |
| Ignored by `.gitignore` only | not part of the change | **yes**, unless also in `.dockerignore` |
| Ignored by `.git/info/exclude` or a global exclude | not part of the change | **yes** |

Inside the container the Dockerfile runs `git init` and `git add -A`, so these
stray files also become *tracked* in the container's repository. Gates that
check the tracked or unignored inventory then judge files that are not part
of the change.

Incident: pushing #1046, the pre-push unit gate failed in
`test/unit/scripts/machine-local-path-policy.test.ts`. The offender was
`.graft/logs/mcp-runtime.ndjson`, a local tool log containing absolute host
paths. It was hidden on the host only by `.git/info/exclude`, so `git status`
was clean, but the build context included it.

The same gap makes container runs non-reproducible. An untracked fixture, a
leftover generated file or a half-written module can make a run pass or fail
where CI's fresh checkout would not. `.dockerignore` can't close this: it is
a deny-list, and it can't know about files each developer's tools create.

## Decision

The runner stages a build context from **existing paths `git ls-files`
lists**, taking each path's working-tree content. Docker then applies the
tracked `.dockerignore` to that context and performs the Dockerfile's build.

1. Before `docker compose run --build`, `RunDockerTestContainer.sh` creates a
   context directory inside its existing per-run scratch directory. It is
   removed by the existing cleanup trap.
2. It lists the index with `git ls-files -z --cached`: tracked files plus
   staged new files. A failed inventory stops the run before Docker starts,
   even if Git emitted partial output. It rejects symlink ancestors, which
   could redirect an indexed filename outside the checkout. It skips any
   listed path that no longer exists in the
   working tree, which is a deletion under test. It copies the rest with
   `tar --null --no-recursion -T -`, which keeps modes and symlinks and never
   pulls in a whole directory.
3. It exports `GIT_WARP_DOCKER_CONTEXT` with that directory. The `test`
   service reads `context: ${GIT_WARP_DOCKER_CONTEXT:-..}`, so a direct
   `docker compose` invocation without the runner still builds as before.
4. `.dockerignore` still applies inside the context, since it is itself
   tracked. It gains `.graft` to protect builds that bypass the runner.

The rule a developer has to know is the one Git already teaches: **a new file
must be `git add`ed to be tested.** Edits to tracked files do not need to be
staged.

This copies the working tree; it is not an atomic snapshot against concurrent
edits. Keep the checkout stable while the runner creates its context.

### What does not change

- `input:` entries (`--import-file`) still copy a named host file, including an
  ignored one, after the container starts. That is the explicit way to bring
  in an untracked input.
- `--source-history` still copies source refs through a bundle. Graph refs and
  host Git configuration stay out.
- Exports, the coverage ratchet, the container lifecycle and cleanup are
  unchanged.
- No host repository or Git directory is mounted.

## Alternatives considered

- **Add each offender to `.dockerignore`.** It fixes the reported file and
  nothing else, because every developer's tools create different files. The
  `.graft` line is kept only as defence for compose builds outside the runner.
- **Build from a commit (`git archive HEAD`).** This would also drop uncommitted
  edits to tracked files, forcing a commit before every test run. That is a
  bigger workflow change than this problem needs.
- **Generate `.dockerignore` from `git ls-files`.** A large, churning generated
  file in the tree, and still racy against files created after generation.

## Exclusions

- The direct `docker compose -f docker/docker-compose.test.yml` routes (node22,
  bun, deno) and the `benchmark` service don't go through the runner and keep
  `context: ..`. They can adopt the same context in a follow-up.
- No change to what tests may assume about the container's own Git repository.

## Acceptance

- Before Docker starts, the context contains only existing indexed paths.
  - An untracked file and a file excluded only by `.git/info/exclude` are absent.
  - An unstaged edit to a tracked file and a staged new file are present.
  - A partial failed inventory or a symlink ancestor prevents Docker startup.
  - Indexed leaf symlinks remain symlinks; copying does not dereference them.
- Selected source files survive into the image subject to `.dockerignore`.
  The final `/app` inventory also includes installed dependencies and generated
  build output, so its file count is not required to equal the host index count.
- A regression test in `test/unit/scripts/docker-artifact-export.test.ts`
  proves the same against a fixture repository with a fake `docker`. It
  covers untracked, locally excluded, edited, staged-new and
  deleted-but-tracked paths.
- The pre-push gate suite passes.
