---
cycle: 0268
task_id: DX_github-issues-method-tracker-migration
status: In Progress
github_issue_url: https://github.com/git-stunts/git-warp/issues/572
sponsors:
  human: James
  agent: Codex
started_at: 2026-06-01
release_home: v18.0.0
backlog: []
issues:
  - https://github.com/git-stunts/git-warp/issues/572
evidence:
  - docs/method/github-issue-migration-2026-06-01.json
---

# GitHub Issues Method Tracker Migration

## Method Contract

| Field | Value |
| --- | --- |
| Sponsor human | Open-source project maintainer |
| Sponsor agent | Backlog migration operator |
| Hill | Move git-warp's live Method backlog cards into GitHub Issues with lane labels and source-file provenance, making GitHub Issues the live tracker while repo docs remain evidence. |
| Agent playback question | Can the migration prove every live backlog card has a corresponding GitHub issue with a lane label and source backlog path? |
| Human playback question | Can a community contributor browse GitHub Issues instead of local backlog folders and still understand lane, release, legend, and source context? |
| Accessibility posture | GitHub Issues become the linear public work list. Repo evidence stays linked from issue bodies and design docs. |
| Localization posture | Labels use stable ASCII identifiers. Issue bodies preserve original markdown and source paths. |
| Agent inspectability posture | Migration output must include a machine-readable map from source backlog path to issue URL, issue number, title, and labels. |
| Non-goals | Rewriting every backlog card into a perfect issue template, deleting historical evidence, or introducing GitHub Projects. |

## Source Doctrine

The local `docs/METHOD.md` still describes a filesystem backlog as the active
tracker. The upstream Method repo now says:

- GitHub Issues are the live work tracker.
- Labels are lanes.
- Milestones are release scope.
- Repository files are the evidence ledger.
- Legacy filesystem backlog cards are migration surfaces until imported.

This design applies that new Method stance to git-warp.

## Migration Rule

Every live card under `docs/method/backlog/**` becomes a GitHub issue, excluding
backlog meta documents such as:

- `README.md`;
- `SCORECARD.md`;
- `WORKLOADS.md`;
- `RELEASE_TRIAGE.md`.

The issue body must preserve:

- original source path;
- archived source path, if the card is moved after issue creation;
- original lane;
- filename or frontmatter id;
- legend or prefix when inferable;
- feature and release-home metadata when present;
- original markdown body.

## Lane Labels

Each migrated issue receives a label matching the lane where the card was
found.

| Source location | Required lane label |
| --- | --- |
| `docs/method/backlog/*.md` | `lane:backlog-root` |
| `docs/method/backlog/inbox/*.md` | `lane:inbox` |
| `docs/method/backlog/asap/*.md` | `lane:asap` |
| `docs/method/backlog/up-next/*.md` | `lane:up-next` |
| `docs/method/backlog/bad-code/*.md` | `lane:bad-code` |
| `docs/method/backlog/cool-ideas/*.md` | `lane:cool-ideas` |
| `docs/method/backlog/v18.0.0/*.md` | `lane:v18.0.0` |
| `docs/method/backlog/v19.0.0/*.md` | `lane:v19.0.0` |
| `docs/method/backlog/v20.0.0/*.md` | `lane:v20.0.0` |
| `docs/method/backlog/v21.0.0/*.md` | `lane:v21.0.0` |

Numbered release lanes may also receive `lane:release` for cross-release
queries, but the exact source lane label remains mandatory.

## Supplemental Labels

Supplemental labels improve discovery without replacing lane labels.

| Label family | Source |
| --- | --- |
| `legend:<prefix>` | Filename prefix before `_`, or frontmatter legend. |
| `feature:<name>` | Frontmatter `feature`. |
| `release-home:<version>` | Frontmatter `release_home`. |
| `type:maintenance` | `bad-code` lane. |
| `type:enhancement` | Default for non-debt backlog cards. |
| `blocked` | Cards with non-empty `blocked_by`. |

Labels must be created before issues are created.

## Issue Body Shape

Each issue body should start with migration metadata:

```markdown
## Migrated from Method backlog

GitHub Issues are now the live work tracker. Repository docs remain Method
evidence.

Source backlog: `docs/method/backlog/...`
Archived source: `docs/archive/backlog/github-issue-migration-2026-06-01/...`
Original lane: `v18.0.0`
Original id: `API_no-full-materialization-first-use-optics`
Original legend: `API`
Original feature: `graph-model-substrate`

## Original backlog card

...
```

This keeps GitHub usable without making the original file history disappear.

## Duplicate Detection

Before creating issues, the migration must load existing open and closed
GitHub issues and skip any issue whose body already contains the exact source
backlog marker.

Title matching alone is not enough. The source path is the stable migration
identity.

## Archive Plan

After issue creation:

1. Move migrated cards out of live backlog lanes into
   `docs/archive/backlog/github-issue-migration-2026-06-01/`.
2. Preserve original relative paths below the archive root.
3. Leave `docs/method/backlog/README.md` as a signpost explaining that GitHub
   Issues are the live tracker.
4. Record the issue mapping as machine-readable migration evidence.

The archive is not a second tracker. It is a provenance ledger for cards that
were imported into GitHub.

## Acceptance Criteria

- Every live backlog card has a GitHub issue or an explicit skipped-existing
  mapping.
- Every migrated issue has its source lane label.
- Every migrated issue body includes the source backlog path.
- GitHub label creation is idempotent.
- The migration writes a machine-readable mapping artifact.
- Live backlog cards are archived or otherwise marked non-authoritative after
  issue creation.
- Repo signposts say GitHub Issues are the live tracker and backlog files are
  legacy or archived evidence.
- `git diff --check` and markdown lint pass after repository edits.

## Test Plan

- Dry-run the migration and count cards.
- Check that dry-run count matches repo-visible live backlog card count.
- Query GitHub labels before and after creation.
- Query GitHub issues after migration and verify every source marker maps to
  exactly one issue.
- Verify archived file count matches migrated card count.
- Verify no live backlog card remains outside allowed meta docs.

## Playback Witness

The migration witness must include:

- migration command and output summary;
- issue count created and skipped;
- label count created or reused;
- path to the machine-readable issue map;
- archived card count;
- final `git status`;
- final GitHub issue query proving source markers exist.
