---
cycle: 0169
task_id: V18_post_20_content_cutover_runway
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
completed_at: 2026-05-23
release_home: v18.0.0
bearing_task: 21
promotes_backlog: []
---

# V18 Post-20 Content Cutover Runway

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Reset BEARING after PR #96 and slice the next v18 batch around content-specific
attachment-plane cutover, not around re-adding generic attachments.

## Playback Questions

- Does BEARING name the actual merged state after PR #96?
- Does the next batch distinguish the already-shipped generic attachment plane
  from the not-yet-shipped content attachment cutover?
- Are slices 21 through 30 small enough to review and test independently?
- Is the next PR boundary clear before implementation starts?

## Accessibility / Assistive Reading Posture

The plan is text-only and uses explicit slice names. It does not rely on
diagrams to explain the difference between generic attachments and content
attachment payloads.

## Localization / Directionality Posture

The slice names are protocol planning identifiers and use direct English
phrasing. No layout or directionality assumptions are introduced.

## Agent Inspectability / Explainability Posture

This cycle updates BEARING before code work resumes, so later agents can see
that PR #96 shipped the generic attachment plane and graph-op algebra. The next
tasks explicitly start from content payload semantics over that plane.

## Existing Shape

PR #96 landed:

- runtime-backed node, edge, and attachment record nouns;
- deterministic `WarpState` record projections;
- graph-op algebra projection over those record views.

The remaining v18 graph-substrate backlog has four live notes:

- `PROTO_content-attachment-plane-cutover`;
- `PROTO_legacy-props-as-projection`;
- `INFRA_graph-model-migration-tool`;
- `TRUST_genesis-replay-equivalence`.

## Chosen Boundary

This slice only rewrites BEARING and records the next ten planned moves. It
does not touch runtime code. Runtime content work starts in slice 22 with
content-specific payload nouns.

## Non-Goals

- Do not change content read behavior.
- Do not add migration tooling.
- Do not close any backlog note.
- Do not claim native Continuum witnesshood.

## RED

Observed before GREEN:

```text
docs/BEARING.md still identified PR #95 and origin/main c848f5d4 as the latest
boundary even though PR #96 had merged at 080a60eb.
```

## GREEN

BEARING now names PR #96, merge commit `080a60eb`, the active branch
`v18-continuum-slices-21-25`, and tasks 21 through 30.

## Verification

```text
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0169-v18-post-20-content-cutover-runway/v18-post-20-content-cutover-runway.md
git diff --check HEAD
```

## Closeout

The next implementation slice should add content-specific attachment payload
nouns. Generic attachments already exist; the open question is how content
payload semantics use that attachment plane while legacy `_content*` properties
remain a compatibility lowering/projection detail.

## SSJS Scorecard

- Runtime-backed forms: not applicable; this is a planning slice.
- Boundary validation: green; BEARING now reflects inspectable repo state.
- Behavior ownership: green; runtime behavior is untouched.
- Message parsing: green; no behavior branches parse message text.
- Ambient time or entropy: green; no clocks, dates, timers, or randomness in
  runtime code.
- Fake shape trust or cast-cosplay: green; no code assertions introduced.
