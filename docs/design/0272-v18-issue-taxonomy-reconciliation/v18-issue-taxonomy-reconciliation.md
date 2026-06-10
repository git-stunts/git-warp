# V18 Issue Taxonomy Reconciliation

## Purpose

This cycle reconciles live GitHub issue metadata after the simplified taxonomy
policy landed. It does not close issues without evidence. An issue may be
closed only when the closeout comment cites deterministic evidence in this
shape:

```text
path/to/file.ext#L<number>@<commit-sha>
```

If the repository cannot support a closure with file-line evidence at the
current commit, the issue remains open or the operator is asked for an explicit
disposition.

## Starting State

At commit `ce663b6783957b06b68769e0925b6ea60e2f20cd`, the live tracker had:

| Query | Count |
| --- | ---: |
| Open `priority:asap` issues | 0 |
| Open legacy `lane:asap` issues | 0 |
| Open `type:debt` issues | 0 |
| Open legacy `lane:bad-code` issues | 214 |
| Open `release-home:v18.0.0` issues | 22 |
| Open `lane:v18.0.0` issues | 1 |

The counts prove a metadata migration problem: the new policy exists, but open
issues still use legacy lane and release-home labels.

## Evidence-Gated Closeout Posture

Issue [#547](https://github.com/git-stunts/git-warp/issues/547) is already
closed and is supported by repository evidence:

| Claim | Evidence |
| --- | --- |
| V18-GP1 is landed. | `docs/method/roadmap/v18.0.0/v18-gp1-optics-public-api-closeout.md#L13@ce663b6783957b06b68769e0925b6ea60e2f20cd` |
| #547 is closed as the public Optics closeout goalpost. | `docs/method/roadmap/v18.0.0/v18-gp1-optics-public-api-closeout.md#L25@ce663b6783957b06b68769e0925b6ea60e2f20cd` |
| The deterministic replay matrix names the public Optics fixtures. | `docs/method/roadmap/v18.0.0/v18-gp1-optics-public-api-closeout.md#L87@ce663b6783957b06b68769e0925b6ea60e2f20cd` |

Issue [#549](https://github.com/git-stunts/git-warp/issues/549) is already
closed and is supported by repository evidence:

| Claim | Evidence |
| --- | --- |
| V18-GP2 has all 15 slices complete. | `docs/method/roadmap/v18.0.0/v18-gp2-bounded-memory-large-graph-gate.md#L50@ce663b6783957b06b68769e0925b6ea60e2f20cd` |
| Large-graph-over-small-pool and bounded public-path evidence is deterministic. | `docs/method/roadmap/v18.0.0/v18-gp2-bounded-memory-large-graph-gate.md#L82@ce663b6783957b06b68769e0925b6ea60e2f20cd` |
| Release/tag proof remains explicitly out of scope and belongs to #552. | `docs/method/roadmap/v18.0.0/v18-gp2-bounded-memory-large-graph-gate.md#L118@ce663b6783957b06b68769e0925b6ea60e2f20cd` |

Issue [#552](https://github.com/git-stunts/git-warp/issues/552) must remain
open until the operator explicitly approves tag work. The repo has no
`v18.0.0` tag or publish evidence, and the issue owns release operation rather
than the already-closed non-release goalposts.

## Metadata Migration Rules

Live issue metadata should follow the simplified taxonomy:

| Legacy metadata | New metadata |
| --- | --- |
| `lane:bad-code` | `type:debt` |
| `type:maintenance` on debt issues | remove after adding `type:debt` |
| `release-home:vMAJOR.MINOR.PATCH` | GitHub milestone `vMAJOR.MINOR.PATCH` |
| `lane:vMAJOR.MINOR.PATCH` | GitHub milestone `vMAJOR.MINOR.PATCH` |
| `lane:cool-ideas` | `priority:later` |
| `lane:up-next` | `priority:next` |
| `blocked` | `status:blocked` |
| `work-in-progress` | `status:active` |

Legacy labels may remain on closed historical issues as migration evidence, but
open issues should not use them as live coordination state.

## V18 Reconciliation Contract

- [x] Move open `release-home:v18.0.0` and `lane:v18.0.0` issues into the
      `v18.0.0` milestone.
- [x] Migrate open `lane:bad-code` issues to `type:debt`.
- [x] Remove legacy debt lane/type labels from migrated open debt issues.
- [ ] Update #552 with a comment explaining that #547 and #549 are closed with
      file-line evidence while release operation remains open.
- [ ] Do not close #552 without explicit operator approval.
- [x] Rerun issue-count evidence after migration.

## Post-Migration State

After GitHub metadata reconciliation:

| Query | Count |
| --- | ---: |
| Open `priority:asap` issues | 0 |
| Open legacy `lane:asap` issues | 0 |
| Open legacy `lane:bad-code` issues | 0 |
| Open legacy `type:maintenance` issues | 0 |
| Open `type:debt` issues | 214 |
| Open legacy `release-home:v18.0.0` issues | 0 |
| Open legacy `lane:v18.0.0` issues | 0 |
| Open issues in milestone `v18.0.0` | 23 |

The 23 open `v18.0.0` milestone issues are intentionally visible release
blockers under the simplified policy. The migration did not close any issue.

## Validation Commands

```bash
gh issue list --state open --label 'priority:asap' --limit 1000 --json number --jq 'length'
gh issue list --state open --label 'lane:bad-code' --limit 1000 --json number --jq 'length'
gh issue list --state open --label 'type:debt' --limit 1000 --json number --jq 'length'
gh api repos/git-stunts/git-warp/milestones --paginate --jq '.[] | select(.title=="v18.0.0") | .open_issues'
```
