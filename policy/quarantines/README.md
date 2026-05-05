# Anti-SLUDGE Quarantine Manifests

**Status:** Active
**Owning cycle:** 0025 (split into 0025A, 0025B, 0025C, 0025D)
**Policy:** [`../../docs/ANTI_SLUDGE_POLICY.md`](../../docs/ANTI_SLUDGE_POLICY.md)
**Decisions:** [`../../docs/ANTI_SLUDGE_DECISIONS.md`](../../docs/ANTI_SLUDGE_DECISIONS.md)

## What lives here

One manifest per sludge family. Each manifest lists the files that
are quarantined for that family's rule(s).

As of cycle `0141-quarantine-graduate-clean`, the 0025 file-level
manifest `files` lists are empty. Remaining legacy anti-sludge hits are
narrowed inline with owning-cycle `nosemgrep` comments and reported by
`npm run lint:semgrep` as inline suppressions, not broad file-level
quarantine.

| Manifest | Rule family | Owning cycle |
|---|---|---|
| `0025A-casts.json` | `as unknown as`, `as any` | 0025A |
| `0025B-boundary.json` | `Record<string, unknown>` / `unknown` outside adapters; `JSON.parse`/`fetch`/`process.env` in core | 0025B |
| `0025C-fake-models.json` | `*Like` placeholder types | 0025C |
| `0025D-import-law.json` | core→infrastructure/framework imports | 0025D |

## Manifest schema

```json
{
  "manifest_id": "0025A-casts",
  "owning_cycle": "0025A",
  "rule_family": "casts",
  "rules": [
    "ts-no-double-cast",
    "no-restricted-syntax:as-any"
  ],
  "rationale": "Pre-existing `as unknown as` / `as any` usages discovered at policy adoption time. Each entry grants file-level exemption from the listed rules ONLY. Graduation happens by removing the entry, either by fixing the file or by replacing the file-level exemption with narrow inline suppressions.",
  "generated_at": "2026-04-16T00:00:00Z",
  "generator": "scripts/contamination-map.ts vX",
  "files": [
    "src/path/to/quarantined-file.ts"
  ]
}
```

### Fields

- **`manifest_id`** — stable identifier matching the filename stem.
- **`owning_cycle`** — the sub-cycle responsible for emptying this
  manifest.
- **`rule_family`** — short human-readable label.
- **`rules`** — exact rule identifiers this manifest exempts. These
  must match the rule IDs emitted by the enforcement tool
  (semgrep ID for Semgrep rules; ESLint rule name for ESLint rules).
- **`rationale`** — one-paragraph explanation. This is required
  and must be specific. "Legacy" is not a rationale.
- **`generated_at`** — ISO-8601 timestamp of when the list was last
  regenerated. Updating this is part of the graduation work.
- **`generator`** — script identity that produced the list, for
  audit trail.
- **`files`** — array of repo-relative paths. No globs. No
  directories. Exact files only.

## Graduation rule (mechanical)

If any file in any manifest appears in the branch's
merge-base diff, the
[`scripts/quarantine-graduate-check.ts`](../../scripts/quarantine-graduate-check.ts)
CI gate fails unless one of the following is true:

1. The file has been **removed** from the manifest (sludge fixed).
2. The manifest has been **narrowed** — the file is removed from
   `files`, AND the specific offending lines in the file now carry
   narrow inline `/* eslint-disable-next-line RULE -- 0025X */` or
   `// nosemgrep: RULE -- 0025X` suppressions referencing the
   owning sub-cycle.

The diff basis is **`git merge-base <target-branch> HEAD`**, never
`HEAD~1`. Stacked commits, rebases, and merge workflows are
handled correctly.

## Rule-scoped principle

A file may be quarantined for one family without receiving a free
pass on any other family. There is no "ignore everything about
this file" option. Each manifest lists only the rule IDs it
exempts; ESLint and Semgrep consult each manifest independently.

## Adding new entries

**Adding new entries to a manifest is rejected.** These manifests
shrink only. A new violation in an untouched file represents new
sludge — the policy is hot-adopted for net-new code. File the
violation as the problem, not the entry as the solution.

The **only** legitimate manifest modifications are:

- Removing entries (graduation).
- Regenerating the full manifest by running the contamination
  scanner — which should produce a strict subset of the previous
  state.
- Updating `generated_at` after a regeneration.

## Regeneration

Run:

```text
npm run lint:contamination
```

This re-runs the detection rules against the tree and writes fresh
manifests. CI asserts that the checked-in manifests match the live
contamination set — i.e. you cannot check in a stale manifest to
hide violations in untouched files, and you cannot fail to update a
manifest after graduating a file.

## See also

- `AGENTS.md` — STOP preamble + rejection list + graduation rule.
- `docs/ANTI_SLUDGE_POLICY.md` — full policy.
- `docs/ANTI_SLUDGE_DECISIONS.md` — binding decisions.
- `docs/design/0025-anti-sludge-purge/` — executing cycle.
