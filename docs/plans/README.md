# Versioned release plans

These planning documents define the capability boundaries of the seven accepted future release milestones. They are reviewable snapshots, not a second live work tracker or evidence that a version has shipped. GitHub milestone targeting and issue/PR evidence remain authoritative, mirrored in the [Linear project](https://linear.app/flyingrobots/project/git-warp-bfebc768d452).

Owner: James Ross. The sequence has no assigned calendar dates or effort estimates. The current source baseline is `94b40dac64034cd8caab9bb05efe14a0c22bd735`; the roadmap recorded npm v19.1.0 as published stable. The abandoned v19.2.0/v19.3.0 mainline targets are superseded plans, not releases.

## Plans

| Version | Release proposition | Cards | Must ship | Required disposition | May slip | Discovery | Tracking |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [v20.0.0](./v20.0.0/README.md) | Memory safety and usable public attachments | 23 | 21 | 1 | 0 | 0 | 1 |
| [v20.1.0](./v20.1.0/README.md) | Observable causal histories | 16 | 5 | 0 | 6 | 5 | 0 |
| [v20.2.0](./v20.2.0/README.md) | Repeatable engineering and consumer evidence | 78 | 10 | 0 | 51 | 14 | 3 |
| [v21.0.0](./v21.0.0/README.md) | Bounded retained storage and recursive WARP | 75 | 14 | 0 | 23 | 31 | 7 |
| [v21.1.0](./v21.1.0/README.md) | Safe retention and operational security | 15 | 3 | 0 | 6 | 6 | 0 |
| [v21.2.0](./v21.2.0/README.md) | Reusable packages and generated domain clients | 7 | 6 | 0 | 0 | 0 | 1 |
| [v22.0.0](./v22.0.0/README.md) | Witnessed merge and local reversibility | 20 | 9 | 0 | 2 | 9 | 0 |

The historical inventory contains **234 issues**: 68 must-ship implementation commitments, one required disposition, 88 may-slip candidates, 65 discovery cards, and 12 tracking containers. Containers are not extra executable PRs; discovery requires a decision before executable scope is claimed. These counts preserve the original issue snapshot while reflecting the 2026-10-02 v20.0.0 commitment correction; later milestone additions are not counted here. Every issue assigned to v20.0.0 is mandatory, including formerly optional cards and later additions. No assigned issue may slip. v20.0.0 additionally requires release coordination/closure under [#876](https://github.com/git-stunts/git-warp/issues/876).

## How to use the plans

- Read the release proposition and exit invariants before selecting work. For v20.0.0, every assigned card is mandatory and none may slip. Other release snapshots retain their recorded categories; do not apply their candidate policy to v20.0.0.
- Resolve a discovery card against current source before implementing a historical title. Record one observable outcome, exclusions, acceptance evidence, and a working intermediate state for each executable PR.
- Treat `from → to` as "from must already be integrated for to to be correct." Workstreams, parent/child hierarchy, shared files, and similar topics do not create edges.
- The accepted graph has **79 direct prerequisites**. The plans include every edge once, under the dependent release, with its recorded reason and evidence. Some are explicit ownership decisions; no recorded blocker is not proof of independence.
- Parallel fronts describe paths not ordered by the accepted graph. Shared contracts and unresolved external readiness still require review before declaring work independently mergeable.
- For release snapshots that explicitly permit deferral, move unfinished optional/discovery/container cards to an appropriate later milestone in both trackers. The executable guard requires zero open non-release issues in the target and zero open issues in earlier version milestones; it also gates repository-wide urgent work. Do not weaken it to accommodate prose categories. v20.0.0 permits no such deferral: complete its assigned work and merge required changes instead of moving or dropping issues to clear the gate.
- Use [.github/RELEASE.md](../../.github/RELEASE.md), the [release profile](../../.continuum/release.yml), and the issue/PR evidence for execution. All tests and benchmarks run in COPY-based Docker without host repository/Git mounts.

## Inventory provenance and refresh

The issue tables were generated from a live GitHub/Linear reconciliation captured at `2026-10-02T04:24:27.613318+00:00` (2026-10-01 Pacific): 234 open GitHub issues, 234 active Linear cards, seven matching milestone assignments, and 79 recorded GitHub prerequisites. Commitment categories and accepted edge reasons come from the approved roadmap and milestone scope descriptions. Titles and Linear URLs come from the reconciled tracker records.

The marked `BEGIN GENERATED ISSUE INVENTORY` / `END GENERATED ISSUE INVENTORY` sections are the canonical categorized snapshot within these documents. There is no live-sync job or checked-in generator. Refresh them by fully paginating both trackers, joining the existing GitHub/Linear issue mapping, reconciling current milestone assignments and commitment decisions, then rendering number-sorted rows in the five categories. Reconcile renamed/closed/new issues explicitly; do not infer category from priority or invent a Linear URL.

Validate that each active issue has exactly one release/category/workstream, every prerequisite endpoint exists or has an explicit completed/external disposition, no accepted edge points backward across planned releases, and the graph remains acyclic. Regenerate the dependency registers and counts in the same change. Preserve the capture time and source commit; do not silently replace a historical snapshot with an unverified "current" claim.

The [streaming/indexed/recursive design record](./streaming-indexed-recursive-warp.md) retains its historical incident evidence. Its old v20 target and release sequencing are superseded by [v21.0.0](./v21.0.0/README.md); its source anchors are not a fresh implementation audit.

The [worldline dot mints design record](./worldline-dot-mints.md) defines the v21.0.0 dot identity, minting authority, strand ref layout and migration contract tracked by [#1012](https://github.com/git-stunts/git-warp/issues/1012).

The [optic-only public API contract](./optic-only-public-api.md), tracked by
[#1049](https://github.com/git-stunts/git-warp/issues/1049), defines the observer,
purpose, budget, receipt-derived Coordinate, and migration boundary for
[#1048](https://github.com/git-stunts/git-warp/issues/1048). It is an implementation
contract effective on integration of [#1059](https://github.com/git-stunts/git-warp/pull/1059),
not a claim that the target API has shipped.

The [observation custody design](./observation-custody.md), tracked by
[#1067](https://github.com/git-stunts/git-warp/issues/1067), defines the private
identity, capacity admission and durable evidence shared by the final read/write
receipts. Its ownership graph incorporates the maintainer's direct cutover
amendment; public historical operations remain separately owned by #1053.

The [Docker tracked-context design record](./docker-tracked-context.md) makes the COPY-based test runner build images from `git ls-files` paths only, tracked by [#1047](https://github.com/git-stunts/git-warp/issues/1047).

The [public surface guard plan](./public-surface-guard.md), tracked by
[#1050](https://github.com/git-stunts/git-warp/issues/1050), specifies an export-map
driven capability check and shrinking legacy inventory for the accepted Optic
contract. It does not remove existing APIs.

## Task plan house format

GitHub is the source of truth for planning. An issue is the task plan, and there is no local task-file state. The Taskalisk skill compiles the plan from the issues on every run and keeps no state of its own; its helper is `scripts/taskalisk.py` inside the skill directory. Every command below is read-only unless it says otherwise.

### Frontmatter

A modeled issue starts with an `issue-dag/2` frontmatter block: the first fenced `yaml` block of the body, with only blank lines before it. This block is the only input to the dependency graph: Taskalisk builds no edge or resource from labels, milestones, body sections, or GitHub issue relationships. It also reads linked pull requests, to set status, and body edit history, for the trust gate below. The frontmatter of [#1085](https://github.com/git-stunts/git-warp/issues/1085), as filed:

```yaml
.dag: issue-dag/2
.id: git-stunts/git-warp#1085
.kind: task
.type: task
.blocked_by: []
.holds: [docs/]
```

- `.dag`, `.id`, and `.kind` are required. `.id` is the issue's own reference, so a copied or transferred block fails. `.kind` is `task` (an executable node) or `container` (it groups other issues).
- A task needs `.type` (`feature`, `bug`, `decision`, `research`, `investigation`, `spike`, or `task`) and `.blocked_by` (`[]` for none). A container needs `.children` and has no `.blocked_by`.
- `.holds`, `.meters`, `.status` (`active`, `parked`, or `blocked`), and `.size_hours` are optional. A `.size_hours` above 8 draws a warning: the card is probably not atomic.
- Every reference is `owner/repo#N`. A bare `#N` is invalid, because a transferred issue would silently re-point it.
- An unknown key that starts with `.` fails the run, so a typo cannot drop an edge. Keys without the prefix are notes, and Taskalisk ignores them.

Taskalisk also applies a trust gate: an issue is a node only when its author, and every editor in its body edit history, is the repository owner, has write, maintain, or admin permission, or is allowlisted (`--trust`, or `--trust-codeowners`). An untrusted issue is never a node and brings no edges or resources; when a trusted issue references it, it only blocks that issue until it closes. The full schema is `references/frontmatter-model.md` in the Taskalisk skill. An open issue without frontmatter is unmodeled: Taskalisk lists it and leaves it out of the graph. Taskalisk fails closed: invalid frontmatter in the graph, an unknown reference, or a cycle exits `1`, and any `gh` failure exits `2`.

### Issue body

The body uses one of the six typed house card templates in [`.github/ISSUE_TEMPLATE/`](../../.github/ISSUE_TEMPLATE/): Feature, Bug, Decision, Investigation, Research, or Spike. Blank issues are disabled. The ADR 2 readiness review form is the one sanctioned non-house form; its issues have no frontmatter, so Taskalisk lists them as unmodeled.

Each template starts with a frontmatter skeleton whose `.id` is `git-stunts/git-warp#NEW`. GitHub gives an issue its number only when you submit it, so change `.id` to the issue's own reference right after you file it. Until you do, Taskalisk refuses the block, and every run that includes the issue fails.

After the frontmatter, executing agents receive the issue body as the task: a level-one heading naming the card type (`# Feature`), a fenced ```` ```text ```` block holding the LLM prompt that executes the task and satisfies every completion criterion, then the card's numbered sections `## 1.` to `## 9.`. Section 2 is the card-specific part; its parts are numbered 2, 2b, 2c, and so on. Each template already holds these parts; fill them in and keep them. No tool checks the headings; reviewers do. Never write machine-local absolute paths in an issue; use `~` or repository-relative paths.

Write issues in ASD-STE100 Simplified Technical English: a controlled form of English with one meaning per word, short sentences, and active voice.

### Dependencies

Dependencies live only in `.blocked_by`. An edge *A blocks B* means that B's `.blocked_by` names A: A must be closed (for code work, merged on `main`) before B is correct. Containers never block and are never blocked, and a `.blocked_by` entry that names a container is an error. Labels, milestones, body sections, shared files, similar topics, and GitHub issue relationships do not create edges.

GitHub's native "blocked by" relationships are an optional mirror for the GitHub interface. This command reports drift between them and the frontmatter; the frontmatter wins:

```bash
python3 "${TASKALISK_HOME:?set TASKALISK_HOME to the Taskalisk skill directory}/scripts/taskalisk.py" --from-github --compare-relationships
```

Record a newly discovered prerequisite with `--add-edge`. This command writes to GitHub: it rewrites only the `.blocked_by` line of the second issue, and it restores that issue's old body if the edge makes a cycle. Under the skill's "Propose, then apply" rule, an agent runs it only after the person who asked for the work approves the exact edit.

```bash
python3 "${TASKALISK_HOME:?set TASKALISK_HOME to the Taskalisk skill directory}/scripts/taskalisk.py" --from-github \
  --add-edge "${BLOCKER:?set BLOCKER to owner/repo#N}->${BLOCKED:?set BLOCKED to owner/repo#N}" \
  --reason "${REASON:?set REASON to why the blocker must close first}"
```

### Status

`.status: active` marks work in progress, `.status: parked` marks work that was started and stopped with its branch pushed to `origin`, and `.status: blocked` marks work blocked by something outside the dependency graph. A blocked task is never put in a dispatch batch. Dependency blocking is computed from the edges and is never declared.

The `status:*` labels are query indexes for people and release gates; Taskalisk does not read them. `status:blocked` needs the reason in the issue body, and `status:parked` needs a branch pushed to `origin`. When the state changes, set the label and `.status` together.

### Resources

Resources sit beside the graph, never in it. `.holds` lists the git-locks keys that a task holds for its whole duration; a trailing `/` claims a subtree, so `docs/` conflicts with `docs/plans/`. `.meters` lists semaphore slots as `name` (one slot) or `name*N`; pass capacities with `--sem-capacity name=N`, and an unknown capacity counts as 1. Declare a resource only when other tasks contend for it for the whole task: the same worktree, the same Docker container or worker, a device, or a system-wide resource with exclusive access. Separate worktrees need no repository path locks, and short commands take their git-locks keys when they run, outside `.holds`. There is no default resource, and Taskalisk does not read `lock:*` labels. Take `host/*` keys in the workstation store that every repository on the host shares; take repository paths in this repository's default store.

### ROADMAP.md

Root `ROADMAP.md` is a rendered view, not a second tracker. Its hand-written part is the executive summary: what is missing and why it completes the milestone. The block between the generated markers is the output of this command, pasted in unchanged:

```bash
python3 "${TASKALISK_HOME:?set TASKALISK_HOME to the Taskalisk skill directory}/scripts/taskalisk.py" --from-github --emit-roadmap
```

The block holds graph health metrics, the ranked Open Frontier, a conflict-free git-locks batch, task checklists by wave and by workstream, the transitively reduced dependency diagram, and the prerequisite edge accounting. Wave numbers, unlock lists, and status are computed on every run and are never hand-maintained. In this mode Taskalisk does not filter by milestone (`--milestone` applies only to the inventory mode), so the block covers every open modeled issue in this repository, plus the issues that their frontmatter references. Regenerate the block after tracker changes; never edit it by hand.

The block has no branch audit, and `ROADMAP.md` has no hand-written one. For worktrees, unmerged branches, and open PRs with the issues they close, run the inventory mode:

```bash
python3 "${TASKALISK_HOME:?set TASKALISK_HOME to the Taskalisk skill directory}/scripts/taskalisk.py" --repo . --milestone v21.0.0
```

The inventory fails closed: any failed `git` or `gh` call, including one for a registered worktree whose directory is gone or broken, makes it exit `2` and name the failure in `inventory_errors`.
