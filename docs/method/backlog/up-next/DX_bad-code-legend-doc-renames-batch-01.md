# Bad-Code Legend Doc Renames Batch 01

The `bad-code` legend reorg made invariant grouping canonical, but
these backlog filenames still carry retired legend prefixes.

Rename this batch of 10 files so on-disk names match the live legend
system without taking on a giant churn slice.

## Fix

Rename each file below, preserve body content, update
`docs/method/backlog/bad-code/README.md`, and repair any in-repo
references to the old path.

## Files

- `docs/method/backlog/bad-code/CC_btr-audit-ambient-timestamps.md` -> `docs/method/backlog/bad-code/HEX_btr-audit-ambient-timestamps.md`
- `docs/method/backlog/bad-code/CC_domain-hex-defaults.md` -> `docs/method/backlog/bad-code/HEX_domain-hex-defaults.md`
- `docs/method/backlog/bad-code/CC_domain-utils-misplaced.md` -> `docs/method/backlog/bad-code/HEX_domain-utils-misplaced.md`
- `docs/method/backlog/bad-code/CC_index-rebuild-profiling-in-domain.md` -> `docs/method/backlog/bad-code/HEX_index-rebuild-profiling-in-domain.md`
- `docs/method/backlog/bad-code/CC_message-codec-hex.md` -> `docs/method/backlog/bad-code/HEX_message-codec-hex.md`
- `docs/method/backlog/bad-code/CC_sync-no-rate-limiting.md` -> `docs/method/backlog/bad-code/HEX_sync-no-rate-limiting.md`
- `docs/method/backlog/bad-code/CC_sync-secret-plain-string.md` -> `docs/method/backlog/bad-code/HEX_sync-secret-plain-string.md`
- `docs/method/backlog/bad-code/CC_sync-server-no-graceful-shutdown.md` -> `docs/method/backlog/bad-code/HEX_sync-server-no-graceful-shutdown.md`
- `docs/method/backlog/bad-code/CC_syncauth-ambient-entropy.md` -> `docs/method/backlog/bad-code/HEX_syncauth-ambient-entropy.md`
- `docs/method/backlog/bad-code/CC_wall-clock-eslint-suppressions.md` -> `docs/method/backlog/bad-code/HEX_wall-clock-eslint-suppressions.md`
