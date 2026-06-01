# backlog

GitHub Issues are now the live Method work tracker for this repository.

This directory is retained as a migration signpost only. The former filesystem
backlog cards were imported into GitHub Issues on 2026-06-01 and then archived
under:

- [github-issue-migration-2026-06-01](../../archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog)

The machine-readable migration evidence is:

- [github-issue-migration-2026-06-01.json](../github-issue-migration-2026-06-01.json)

## Current Tracker

Use GitHub Issues for live work:

- [all open issues](https://github.com/git-stunts/git-warp/issues)
- [v18 lane](https://github.com/git-stunts/git-warp/issues?q=is%3Aissue%20is%3Aopen%20label%3Alane%3Av18.0.0)
- [bad-code lane](https://github.com/git-stunts/git-warp/issues?q=is%3Aissue%20is%3Aopen%20label%3Alane%3Abad-code)
- [inbox lane](https://github.com/git-stunts/git-warp/issues?q=is%3Aissue%20is%3Aopen%20label%3Alane%3Ainbox)

## Migration Summary

| Metric | Count |
|--------|------:|
| Backlog cards imported as GitHub Issues | 460 |
| GitHub Issues created in migration | 460 |
| Existing source-path issues skipped | 0 |
| Support labels ensured | 65 |
| Archived backlog files | 467 |

Every migrated issue body contains:

- `Source backlog: ...`
- `Archived source: ...`
- the original lane;
- original id, legend, feature, release home, and dependency metadata when
  present;
- the original backlog card body.

## Lane Labels

Cards were labeled according to the document lane they came from:

- `lane:backlog-root`
- `lane:bad-code`
- `lane:cool-ideas`
- `lane:inbox`
- `lane:up-next`
- `lane:v18.0.0`
- `lane:v19.0.0`
- `lane:v20.0.0`
- `lane:v21.0.0`

Numbered release lanes also received `lane:release`.

## Rule

Do not add new live work cards under `docs/method/backlog/**`. Capture new work
as GitHub Issues and link issue URLs from design docs, witnesses, retros, and
release evidence.
