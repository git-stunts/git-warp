# Versioned release plans

These planning documents define the capability boundaries of the seven accepted future release milestones. They are reviewable snapshots, not a second live work tracker or evidence that a version has shipped. GitHub milestone targeting and issue/PR evidence remain authoritative, mirrored in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452).

Owner: James Ross. The sequence has no assigned calendar dates or effort estimates. The current source baseline is `94b40dac64034cd8caab9bb05efe14a0c22bd735`; the roadmap recorded npm v19.1.0 as published stable. The abandoned v19.2.0/v19.3.0 mainline targets are superseded plans, not releases.

## Plans

| Version | Release proposition | Cards | Must ship | Required disposition | May slip | Discovery | Tracking |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [v20.0.0](./v20.0.0/README.md) | Memory safety and usable public attachments | 23 | 13 | 1 | 8 | 0 | 1 |
| [v20.1.0](./v20.1.0/README.md) | Observable causal histories | 16 | 5 | 0 | 6 | 5 | 0 |
| [v20.2.0](./v20.2.0/README.md) | Repeatable engineering and consumer evidence | 78 | 10 | 0 | 51 | 14 | 3 |
| [v21.0.0](./v21.0.0/README.md) | Bounded retained storage and recursive WARP | 75 | 14 | 0 | 23 | 31 | 7 |
| [v21.1.0](./v21.1.0/README.md) | Safe retention and operational security | 15 | 3 | 0 | 6 | 6 | 0 |
| [v21.2.0](./v21.2.0/README.md) | Reusable packages and generated domain clients | 7 | 6 | 0 | 0 | 0 | 1 |
| [v22.0.0](./v22.0.0/README.md) | Witnessed merge and local reversibility | 20 | 9 | 0 | 2 | 9 | 0 |

The inventory contains **234 active issues**: 60 must-ship implementation commitments, one required disposition, 96 may-slip candidates, 65 discovery cards, and 12 tracking containers. Containers are not extra executable PRs; discovery requires a decision before executable scope is claimed. v20.0.0 additionally requires release coordination/closure under [#876](https://github.com/git-stunts/git-warp/issues/876).

## How to use the plans

- Read the release proposition and exit invariants before selecting work. Scope categories distinguish commitments from candidates; a release home alone does not make every card mandatory.
- Resolve a discovery card against current source before implementing a historical title. Record one observable outcome, exclusions, acceptance evidence, and a working intermediate state for each executable PR.
- Treat `from → to` as "from must already be integrated for to to be correct." Workstreams, parent/child hierarchy, shared files, and similar topics do not create edges.
- The accepted graph has **79 direct prerequisites**. The plans include every edge once, under the dependent release, with its recorded reason and evidence. Some are explicit ownership decisions; no recorded blocker is not proof of independence.
- Parallel fronts describe paths not ordered by the accepted graph. Shared contracts and unresolved external readiness still require review before declaring work independently mergeable.
- Before release preparation, move unfinished optional/discovery/container cards to an appropriate later milestone in both trackers. The executable guard requires zero open non-release issues in the target and zero open issues in earlier version milestones; it also gates repository-wide urgent work. Do not weaken it to accommodate prose categories.
- Use [.github/RELEASE.md](../../.github/RELEASE.md), the [release profile](../../.continuum/release.yml), and the issue/PR evidence for execution. All tests and benchmarks run in COPY-based Docker without host repository/Git mounts.

## Inventory provenance and refresh

The issue tables were generated from a live GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific): 234 open GitHub issues, 234 active Linear cards, seven matching milestone assignments, and 79 recorded GitHub prerequisites. Commitment categories and accepted edge reasons come from the approved roadmap and milestone scope descriptions. Titles and Linear URLs come from the reconciled tracker records.

The marked `BEGIN GENERATED ISSUE INVENTORY` / `END GENERATED ISSUE INVENTORY` sections are the canonical categorized snapshot within these documents. There is no live-sync job or checked-in generator. Refresh them by fully paginating both trackers, joining the existing GitHub/Linear issue mapping, reconciling current milestone assignments and commitment decisions, then rendering number-sorted rows in the five categories. Reconcile renamed/closed/new issues explicitly; do not infer category from priority or invent a Linear URL.

Validate that each active issue has exactly one release/category/workstream, every prerequisite endpoint exists or has an explicit completed/external disposition, no accepted edge points backward across planned releases, and the graph remains acyclic. Regenerate the dependency registers and counts in the same change. Preserve the capture time and source commit; do not silently replace a historical snapshot with an unverified "current" claim.

The [streaming/indexed/recursive design record](./streaming-indexed-recursive-warp.md) retains its historical incident evidence. Its old v20 target and release sequencing are superseded by [v21.0.0](./v21.0.0/README.md); its source anchors are not a fresh implementation audit.
