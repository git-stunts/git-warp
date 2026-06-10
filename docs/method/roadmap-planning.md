# Roadmap Planning System

git-warp uses a roadmap-driven, issue-backed, slice-budgeted delivery system
for release-scale work.

The system separates intent, coordination, execution, and proof:

- Markdown documents define intent, scope, contracts, acceptance criteria, and
  proof obligations.
- GitHub Issues coordinate goalposts, proof stories, labels, ownership, and
  remaining work.
- Branches, commits, and pull requests execute reviewable changes.
- Tests, deterministic fixtures, witnesses, generated artifacts, Git object
  facts, package artifacts, and CI prove implementation.

A design document may define intent, but it does not prove implementation. A
goalpost is complete only when the repo can prove the claimed behavior through
an executable or inspectable software surface. A witness without canonical
inputs is not proof. A canonical fixture without a replay command is not proof.
A materialized graph without observer geometry is not proof.

## System Model

| Entity | Purpose | Location |
| --- | --- | --- |
| Vision | Long-term product and substrate direction | `docs/VISION.md` |
| Bearing | Current operational direction | `docs/BEARING.md` |
| Roadmap | Orders release slots and issue buckets | `docs/ROADMAP.md` |
| Versioned release | SemVer product target | Roadmap release section |
| Goalpost | Release-scoped milestone | Goalpost doc and umbrella issue |
| Umbrella issue | Goalpost tracking root | GitHub Issue with `type:goalpost` |
| Proof story | Actor-centered behavior or invariant | Child issue and goalpost section |
| Slice | Reviewable increment | Goalpost checklist |
| Slice budget | Planning estimate and progress denominator | Roadmap and goalpost docs |
| Acceptance criteria | Completion contract | Goalpost doc and issue body |
| Proof matrix | Required deterministic evidence | Goalpost doc and release packet |
| Pull request | Review and merge vehicle | GitHub PR |
| Release evidence | Release-level replay packet | `docs/releases/vX.Y.Z/README.md` |

The hierarchy is:

```text
VISION.md
  -> BEARING.md
    -> ROADMAP.md release buckets
      -> goalpost doc
        -> umbrella GitHub issue
          -> proof-story child issues
            -> slices
              -> commits
                -> pull request
                  -> deterministic witnesses
                    -> release evidence
```

## Authority Model

Authority flows in this order:

1. Runtime behavior, Git object facts, deterministic fixtures, and witnesses.
2. Tests, CI, release guard output, package artifacts, and generated surfaces.
3. GitHub Issues, pull requests, labels, review state, and issue comments.
4. Design docs, goalpost docs, roadmap docs, `BEARING.md`, and `VISION.md`.
5. `CHANGELOG.md`, release notes, and coordination summaries.
6. Think, chat, and other memory layers.

Memory helps coordination, but it does not override files, commits, commands,
GitHub Issues, pull requests, tests, generated output, deterministic witnesses,
or release evidence.

A materialized graph is not authority by itself. It is a reading whose causal
basis, aperture, law, projection, observer geometry, support obligations, budget
posture, and witness posture must be named.

## Versioned Releases

A roadmap release slot is a bounded SemVer product target such as `v18.0.0`.
Release identifiers use leading-`v` SemVer:

```text
vMAJOR.MINOR.PATCH
```

Versioned release planning has four jobs:

1. Name the release outcome in product and substrate terms.
2. Select the goalposts and issues required to call that release complete.
3. Order goalposts by dependency, risk, and release pressure.
4. Define the release gate that must be true before the version can be tagged.

Do not create a new version for every feature. Feature work belongs inside the
current active version unless it changes the release promise.

## Goalpost Contract

A goalpost is a release-scoped milestone with one umbrella issue, one goalpost
document, one slice budget, one proof matrix, and one acceptance contract.

```text
Goalpost = {
  id: "vX.Y.Z-gp-<slug>",
  title: string,
  releaseHome: "vMAJOR.MINOR.PATCH",
  umbrellaIssue: GitHubIssue,
  goalpostDoc: MarkdownDocument,
  sliceBudget: PositiveInteger,
  proofStories: ProofStory[],
  acceptanceCriteria: ChecklistItem[],
  proofMatrix: DeterministicEvidenceRow[],
  status: "planned" | "scaffolded" | "active" | "review-ready" | "landed" | "superseded"
}
```

A goalpost must answer:

- What product, runtime, operator, protocol, or release outcome does this unlock?
- What inspectable contract exists?
- What is in scope?
- What is out of scope?
- Which proof stories make up the goalpost?
- How many slices are budgeted?
- What must be true before the goalpost is done?
- Which deterministic fixtures, witnesses, commands, generated artifacts, Git
  facts, package facts, or CI facts prove it?

Goalpost docs live under `docs/design/<cycle>/` when they are part of an active
cycle. Longer-lived release planning packets may live under
`docs/method/roadmap/` if they are not yet active implementation cycles.

Use [goalpost-template.md](goalpost-template.md) when creating a goalpost doc.

## Proof Story Contract

git-warp uses proof stories rather than user stories. Some stories are about
package consumers, but others are about operators, agents, maintainers, protocol
peers, adapters, generated clients, or the substrate itself.

```text
ProofStory = {
  issue: GitHubIssue,
  actor: "consumer" | "operator" | "agent" | "maintainer" | "adapter" | "protocol-peer" | "release-operator",
  need: string,
  reason: string,
  currentWorkaroundOrFailure: string,
  proof: DeterministicEvidenceRow[],
  sliceBudget: PositiveInteger
}
```

A well-formed proof story uses this shape:

```text
A <actor> needs <capability or invariant>
so that <runtime, release, protocol, or operator outcome>,
without relying on <current unsafe workaround>.
```

Intent alone is not enough. Every proof story must name proof.

## Slice Contract

A slice is the smallest useful execution unit. A good slice can usually be
reviewed independently and has one obvious proof.

```text
Slice = {
  number: PositiveInteger,
  description: string,
  expectedProof: "test" | "fixture" | "witness" | "schema" | "runtimeBehavior" | "docUpdate" | "issueUpdate",
  status: "open" | "inProgress" | "complete"
}
```

A slice should usually end in one of:

- a RED/GREEN test;
- a canonical fixture plus witness;
- a manifest or schema contract;
- a CLI or operator proof;
- a release evidence update;
- a docs correction backed by inspectable code, tests, or repo facts;
- a bad-code quarantine paydown.

Docs-only slices are allowed for planning, but they must be marked as planning
slices. They do not complete implementation goalposts.

Slice budgets provide progress denominators:

```text
GoalpostProgress = completed slices / total slices
ReleaseProgress = landed goalposts / total goalposts
```

Progress reports should use concrete denominators, for example:

```text
Goalpost Checkpoint Basis Manifest: 3/8 slices
v18.0.0 release goalposts: 2/5 landed
```

## Deterministic Proof Policy

No implementation goalpost is complete through documentation alone.

Acceptable proof includes:

- unit tests against runtime modules;
- fixture-table tests;
- canonical graph, Git, suffix, checkpoint, or package fixtures;
- deterministic command output;
- CLI transcripts with normalized host-specific noise;
- generated artifact checks;
- schema or manifest validation;
- CI checks;
- package artifact inspections;
- release guard output;
- accessibility, API, operator, or agent witnesses;
- inspectable runtime facts.

Every goalpost proof matrix must record:

| Field | Requirement |
| --- | --- |
| Claim | The behavior, invariant, or release assertion being proven. |
| Canonical fixture or input | The immutable input required to replay the proof, or `not applicable` when the tag commit is sufficient. |
| Witness | The observed output, artifact, transcript, CI run, or generated fact. |
| Replay command | The command, test, workflow, or inspection path that reproduces the witness. |
| Expected deterministic result | The stable output, digest, normalized transcript, pass condition, or inspected fact. |

Host-specific noise must be normalized or excluded explicitly. Examples include
temp paths, clocks, random IDs, process IDs, network timestamps, registry
timestamps, tool download timing, absolute paths, and unordered host map output.

Reproducibility is a support obligation over clocks, randomness, network,
filesystem reads, environment variables, toolchain versions, policy state,
model versions, human approvals, and GitHub issue state. Hidden ambient causes
must be sampled outside the deterministic boundary, recorded, and witnessed.
Use [canonical-fixtures.md](canonical-fixtures.md) for fixture and witness
naming, replay, and normalization rules.

## Issue Label Model

Labels are query indexes, not prose decoration.

git-warp keeps its structured label model:

| Axis | Meaning |
| --- | --- |
| `type:*` | Work kind. Use exactly one of `type:bug`, `type:debt`, `type:feature`, `type:docs`, `type:release`, `type:goalpost`, or `type:story`. Existing `type:proof-story` issues are migration residue for proof-story children. |
| `priority:*` | Scheduling pressure. Use zero or one of `priority:asap`, `priority:next`, or `priority:later`. |
| `status:*` | Active workflow exception. Use `status:blocked` or `status:active` only when true. |
| `area:*` | Primary work area, such as `area:api`, `area:runtime`, `area:storage`, `area:query`, `area:sync`, `area:docs`, `area:testing`, `area:tooling`, `area:release`, or `area:architecture`. |
| GitHub Milestone | Release ownership and prior-release cleanup target. |

The important invariant is that `type:goalpost` and child story types are not
mixed casually. Umbrella issues get `type:goalpost`; child proof-story issues
prefer `type:story` for new work while existing `type:proof-story` issues are
migrated.

## Lifecycle

Goalpost lifecycle:

```text
planned
  -> scaffolded: goalpost doc + umbrella issue + child proof-story issues
  -> active: branch + cycle implementation starts
  -> review-ready: slices complete + validation green
  -> landed: PR merged and release evidence updated when release-relevant
  -> superseded: roadmap changes invalidate the goalpost
```

Cycle lifecycle remains the loop in [METHOD.md](../METHOD.md). Goalposts do not
replace cycles. They give release-scale work a stable milestone contract and a
slice denominator.

The canonical planning-to-merge path is:

```text
ROADMAP.md release slot
  -> goalpost doc
    -> umbrella issue
      -> proof-story issues
        -> slices
          -> cycle branch
            -> commits
              -> pull request
                -> merge
```

## Operating Invariants

- Every versioned release has a roadmap section.
- Every versioned release uses leading-`v` SemVer: `vMAJOR.MINOR.PATCH`.
- Every release-scale milestone has a goalpost doc or an explicit reason why it
  remains a single-issue cycle.
- Every goalpost has one umbrella GitHub Issue.
- Every umbrella issue collects child proof-story issues as checklist items or
  linked issue references.
- Every child issue maps to a proof story, not a vague task.
- Every goalpost has a slice budget.
- Every goalpost doc has an acceptance checklist and proof matrix.
- Runtime, protocol, package, and product work must have executable or
  inspectable proof.
- Markdown docs are planning artifacts, not proof artifacts.
- A witness without canonical inputs is not proof when the inputs are mutable or
  missing.
- A fixture without a replay command is not proof.
- A materialized graph without observer geometry is not proof.
- Changes are committed as normal commits, never amended.
- Branches, commits, and PRs do not use a `codex` prefix.
- PRs are non-draft unless repo policy changes.

## Release Gate Integration

Release evidence must name every landed goalpost that contributes to the target
version. For each goalpost, the release packet records:

- goalpost issue;
- goalpost doc;
- landed PRs;
- completed slice count;
- proof matrix location;
- canonical fixtures or immutable inputs;
- witnesses;
- replay commands;
- accepted residual risks.

Before a release may be tagged, no target-version goalpost issue may remain open
unless the release evidence names it as explicitly superseded or out of scope
for that version with a linked issue disposition.

`npm run goalpost:guard` is the advisory structural guard for goalpost docs. It
passes when no goalpost docs exist, and it fails when any goalpost doc omits the
required identity, slice, proof-story, acceptance, deterministic evidence, or
release-gate sections.
