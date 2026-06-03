# Design Doc Template

This is the standard shape for new git-warp cycle design docs.

Design docs define intent, contracts, non-goals, and proof plans. They do not
prove implementation. For implementation work, at least one required test must
exercise the actual software surface: package API, runtime behavior, Git-backed
persistence behavior, migration behavior, sync protocol behavior, CLI command
behavior, schema validation, public docs examples, machine-readable witness
output, CI/tooling behavior, or rendered output.

Design-doc assertions, inventory tests, and docs guards are allowed as
evidence-ledger checks. They cannot be the only acceptance proof for product,
runtime, storage, protocol, migration, CLI, sync, release, or rendered work.

A good git-warp design doc is specific enough that another engineer or agent can
write the RED test from it without asking what behavior is supposed to exist. A
bad design doc mostly says that a document exists, a feature would be nice, or a
user will be happier, without naming the contract, failure mode, lower mode, or
proof.

## Frontmatter

Use this frontmatter for new cycle design docs:

```yaml
---
title: "<LEGEND>-<ID> - <Short Title>"
cycle: "<NNNN>"
task_id: "<slug>"
legend: "<API|DX|HYGIENE|INFRA|PERF|PROTO|RELEASE|SLUDGE|TRUST|TS|TUI|VIZ>"
release_home: "v18.0.0|v19.0.0|none"
issue: "https://github.com/git-stunts/git-warp/issues/<number>"
status: "draft|active|landed|superseded"
base_commit: "<fully-qualified-sha>"
owners:
  - "@git-stunts"
sponsors:
  human: "James"
  agent: "Codex"
blocking_issues: []
supersedes: []
superseded_by: null
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
---
```

Status meanings:

- `draft`: not yet committed as active work.
- `active`: pulled into a cycle; sponsors own the hill.
- `landed`: implementation and witness evidence merged or otherwise complete.
- `superseded`: replaced by another design; `superseded_by` points at it.

## Required Sections

Every new cycle design doc must include these sections:

- Linked Issue
- Design Type
- Decision Summary
- Sponsored Human
- Sponsored Agent
- Hill
- Current Truth
- Problem
- Scope
- Non-Goals
- Runtime / API Contract and/or User Experience / Product Shape
- Accessibility Posture
- Agent Inspectability / Explainability Posture
- Linked Invariants
- Design Alternatives Considered
- Decision
- Proof Surface
- Implementation Slices
- Tests To Write First
- Acceptance Criteria
- Validation Plan
- Playback / Witness
- Risks
- Follow-On Debt
- Tracker Disposition
- Done Does Not Mean
- Retrospective

## Conditional Sections

Include these sections when the design touches the named concern:

| Section | Required when |
| --- | --- |
| Data / State Model | State persists, mutates, derives, or crosses a boundary. |
| Architecture / Anti-SLUDGE Posture | Code changes. |
| Cost / Residency Posture | Public APIs, reads, writes, content, sync, Optics, or large-graph behavior change. |
| Determinism / Replay / Causality | Graph history, CRDT behavior, migration, checkpoints, coordinates, or sync change. |
| Git Substrate Impact | Refs, commits, trees, blobs, object ids, tags, storage, migration, or release behavior change. |
| Compatibility / Migration Posture | Public API, package export, storage format, docs, release, or legacy behavior changes. |
| Error Contract | Runtime, API, CLI, protocol, sync, migration, or operator behavior changes. |
| Security / Trust / Redaction Posture | Authority, sync, transport, logs, reports, trust, secrets, or signatures change. |
| Lower Modes | The result is user-visible or agent-visible. |
| User-Facing Text / Directionality | Visible CLI, TUI, docs, report, or error text changes. |
| UI Mockups | Rendered, TUI, visualizer, docs-app, or interactive visual surfaces change. |

git-warp does not currently have localization support. Design docs must not
invent localization process, locale catalogs, or translation-completeness gates.
When visible text changes, the design still names the strings, accessibility
implications, machine-readable equivalent output, and any directionality
assumptions.

## Evidence Rules

Current Truth is factual, not aspirational. Strong claims must cite concrete
evidence:

- source files
- tests
- commands
- public APIs
- current docs
- GitHub issues or pull requests
- committed witness artifacts
- CI run URLs, when CI evidence matters

Use full-SHA GitHub permalinks for source and test anchors:

```text
[<repo-relative-path>#<line-number>:<fully-qualified-commit-sha>](https://github.com/git-stunts/git-warp/blob/<fully-qualified-commit-sha>/<repo-relative-path>#L<line-number>)
```

Local command results may support a design, but they are not durable release
evidence unless captured in a committed witness, retro, CI run, or other
inspectable artifact.

## Template

Copy this skeleton when opening a new cycle design:

````markdown
---
title: "<LEGEND>-<ID> - <Short Title>"
cycle: "<NNNN>"
task_id: "<slug>"
legend: "<API|DX|HYGIENE|INFRA|PERF|PROTO|RELEASE|SLUDGE|TRUST|TS|TUI|VIZ>"
release_home: "v18.0.0|v19.0.0|none"
issue: "https://github.com/git-stunts/git-warp/issues/<number>"
status: "draft|active|landed|superseded"
base_commit: "<fully-qualified-sha>"
owners:
  - "@git-stunts"
sponsors:
  human: "James"
  agent: "Codex"
blocking_issues: []
supersedes: []
superseded_by: null
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
---

# <LEGEND>-<ID> - <Short Title>

## Linked Issue

- https://github.com/git-stunts/git-warp/issues/<number>

## Design Type

This design is primarily:

- [ ] Runtime/API
- [ ] Storage/substrate
- [ ] Sync/protocol
- [ ] Migration/release
- [ ] CLI/operator
- [ ] Docs/public guidance
- [ ] TUI/visual surface
- [ ] Test/tooling

## Decision Summary

One short paragraph describing the decision this document is making. Say what
will exist, what it will do, and what boundary it owns.

## Sponsored Human

A <type of user> wants <capability/outcome> so that <reason>, without having to
<current pain or unsafe workaround>.

## Sponsored Agent

An agent needs <inspectable contract/tool/surface> so it can <operation>,
without inferring <unstable/private/visual-only state>.

## Hill

By the end of this cycle, <user/agent> can <observable outcome> through
<surface/API/command>, and the repo proves it with <tests/witnesses>.

## Current Truth

Describe what exists today. Include concrete anchors: files, commands, exported
APIs, current docs, current failure mode, relevant issues or PRs, and known test
coverage.

Evidence:

- [<repo-relative-path>#<line-number>:<fully-qualified-commit-sha>](https://github.com/git-stunts/git-warp/blob/<fully-qualified-commit-sha>/<repo-relative-path>#L<line-number>)

## Problem

State the actual problem.

Good:

- "The checkpoint-tail basis verifier reads full tree maps before it can reject
  an unsupported basis, so a bounded-looking Optic setup path still depends on a
  full-residency provider."

Bad:

- "Optics need to be better."

## Scope

This cycle includes:

- ...

## Non-Goals

This cycle does not include:

- ...

## Runtime / API Contract

Name the software contract. Include only the relevant subsections:

- exported functions/types
- command intents
- schema input/output
- facts emitted
- state transitions
- layout/focus/input boundaries
- error behavior
- compatibility aliases or migration behavior

## User Experience / Product Shape

Required for CLI, TUI, docs, visual, or public onboarding work. For non-rendered
runtime work, say "Not applicable" and explain which runtime or operator surface
is the user-visible contract.

Include a user journey Mermaid diagram when a human or operator workflow changes.
Describe golden paths, alternative flows, success, failure, retry, and undo when
applicable.

## Wide UI Mockup

Required only for rendered, TUI, docs-app, visualizer, or interactive visual
surfaces.

## Narrow UI Mockup

Required only for rendered, TUI, docs-app, visualizer, or interactive visual
surfaces.

## Data / State Model

Required when state persists, mutates, derives, or crosses a boundary.

| State | Source of truth | Derived state | Invalid states | Reset behavior | Serialization | Determinism assumptions |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

Use Mermaid diagrams for complex class, entity, state transition, or data-flow
changes.

## Architecture / Anti-SLUDGE Posture

Required when code changes.

| Concern | Decision |
| --- | --- |
| Domain changes |  |
| Port changes |  |
| Adapter changes |  |
| Boundary validation |  |
| Runtime-backed nouns introduced |  |
| Expected failure representation |  |
| Banned shortcuts avoided |  |
| Quarantine impact |  |

## Cost / Residency Posture

Required when public APIs, reads, writes, content, sync, Optics, or large-graph
behavior change.

| Surface | Current cost | Target cost | Limit/budget | Failure mode |
| --- | --- | --- | --- | --- |
|  | bounded/streaming/cursor/transitional/diagnostic/offline/legacy |  |  |  |

## Determinism / Replay / Causality

Required when graph history, CRDT behavior, migration, checkpoints, coordinates,
or sync change.

This design preserves deterministic replay by:

- ...

Causal inputs:

- basis:
- frontier:
- writer id:
- patch/order source:
- checkpoint or coordinate identity:

Replay/convergence tests:

- ...

## Git Substrate Impact

Required when refs, commits, trees, blobs, object ids, tags, storage, migration,
or release behavior change.

| Substrate area | Impact |
| --- | --- |
| refs |  |
| commits |  |
| trees/blobs |  |
| empty-tree graph commits |  |
| object ids |  |
| tag/release behavior |  |
| migration compatibility |  |

## Compatibility / Migration Posture

Required when public API, package exports, storage format, docs, release, or
legacy behavior changes.

| Concern | Decision |
| --- | --- |
| Public API compatibility |  |
| Package export changes |  |
| Storage/read compatibility |  |
| Legacy behavior retained |  |
| Deprecation behavior |  |
| Migration path |  |
| Release note impact |  |

## Error Contract

Required when runtime, API, CLI, protocol, sync, migration, or operator behavior
changes.

| Failure | Error/result | Caller recovery | Test |
| --- | --- | --- | --- |
|  |  |  |  |

## Security / Trust / Redaction Posture

Required when authority, sync, transport, logs, reports, trust, secrets, or
signatures change.

- trust boundary:
- authority or capability checked:
- secret-bearing values:
- redaction behavior:
- log/report behavior:
- abuse or replay concern:

## Lower Modes

Required when the result is user-visible or agent-visible. Lower modes include
non-visual output, JSON/report output, CLI output, logs/errors, docs examples,
generated artifacts, deterministic witnesses, and agent-readable metadata.

## Accessibility Posture

State how accessibility is preserved. For non-rendered runtime work, describe
the linear reading model for docs, CLI output, reports, errors, or witness
artifacts.

| Concern | Decision |
| --- | --- |
| Semantic labels or facts |  |
| Focus order or focus ownership |  |
| Hidden or visual-only information |  |
| Keyboard behavior |  |
| Secret/redaction behavior |  |

## User-Facing Text / Directionality

Required only when this design adds or changes visible CLI, TUI, docs, report,
or error text.

- new or changed visible strings:
- where the wording appears:
- left-to-right assumptions:
- machine-readable equivalent output:

## Agent Inspectability / Explainability Posture

Describe how an agent can inspect the result without scraping pixels or prose.

Examples:

- stable ids
- metadata fields
- emitted facts
- deterministic pipe output
- registry entries
- schema descriptions
- command ids
- machine-readable witness output

## Linked Invariants

List repo invariants this work must preserve.

Examples:

- Tests Are the Spec
- Runtime Truth Wins
- Hexagonal Architecture
- Git History Is Graph Data
- Public Claims Need Witnesses
- Docs Are Evidence, Not Proof

## Design Alternatives Considered

### Option A: <name>

Pros:

- ...

Cons:

- ...

### Option B: <name>

Pros:

- ...

Cons:

- ...

## Decision

State the chosen option and why. If the decision is temporary, name the
expiration or migration window.

## Proof Surface

The implementation must be proven through:

- actual surface under test:
- first RED test:
- required witness command:
- non-acceptable proof:

## Implementation Slices

- <Smallest testable slice>
- <Next slice>
- <Next slice>

Each slice should be small enough to commit or review independently and should
have its own proof.

## Tests To Write First

Behavior tests required:

- [ ] <package/runtime/render test that fails before implementation>
- [ ] <integration test that exercises user-visible behavior>
- [ ] <lower-mode or pipe/accessibility test, if relevant>
- [ ] <regression test for the specific bug or risk>

Documentation/process tests, only if relevant:

- [ ] <design/changelog/backlog assertion>

Rule: documentation tests cannot be the only proof for implementation work.

## Acceptance Criteria

The work is done when:

- [ ] Behavior test proves <contract>
- [ ] Runtime API, rendered output, command output, or witness proves
  <user-visible outcome>
- [ ] Lower modes are covered, if relevant
- [ ] New visible strings are documented, if relevant
- [ ] Docs, changelog, or release notes are updated, if behavior or direction
  changed
- [ ] Issue and PR are linked correctly
- [ ] CI and local validation are green

## Validation Plan

Commands expected before PR:

```bash
npm run typecheck
npm run lint
npm run lint:sludge
npm run lint:quarantine-graduate
npm run typecheck:consumer
npm run test:local
```

Trim commands that do not apply. Add focused tests and package-specific commands
when needed.

## Playback / Witness

Describe what a reviewer can run or inspect.

Examples:

```bash
npx vitest run test/conformance/<test>.test.ts
npm run release:preflight
```

If there is a visual or TUI result, include the route, key sequence, or terminal
size needed to reproduce it.

## Risks

Known risks:

- ...

Mitigations:

- ...

## Follow-On Debt

Create GitHub issues for anything deferred. Do not hide future work in prose. If
it matters, it gets an issue.

## Tracker Disposition

| Issue | Role | Expected disposition |
| --- | --- | --- |
| #... | primary / blocks / blocked-by / follow-on | close / update / leave open / create follow-up |

## Done Does Not Mean

When this lands, it does not prove:

- ...

## Retrospective

Fill this in after implementation.

What changed from the design:

- ...

What the tests proved:

- ...

What remains open:

- ...

PR:

- https://github.com/git-stunts/git-warp/pull/<number>
````
