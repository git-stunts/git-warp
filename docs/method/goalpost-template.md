# Goalpost Template

Copy this skeleton when creating a roadmap goalpost.

````markdown
# <Release> <Goalpost Title>

## Identity

| Field | Value |
| --- | --- |
| Goalpost id | `<vX.Y.Z-gp-slug>` |
| Release home | `vX.Y.Z` |
| Umbrella issue | `https://github.com/git-stunts/git-warp/issues/<number>` |
| Goalpost doc | `<this path>` |
| Design cycle | `<cycle path or not active yet>` |
| Slice budget | `<N>` |
| Status | `planned|scaffolded|active|review-ready|landed|superseded` |
| Sponsor human | `<name>` |
| Sponsor agent | `<name>` |

## Outcome

State the release-scale outcome this goalpost unlocks.

## Current Truth

Cite current repo-visible facts. Strong claims need source, test, command,
issue, pull request, generated artifact, witness, or CI evidence.

## Scope

- `<in scope>`

## Out Of Scope

- `<out of scope>`

## Proof Stories

Use the proof-story form:

```text
A <actor> needs <capability or invariant>
so that <runtime, release, protocol, or operator outcome>,
without relying on <current unsafe workaround>.
```

| Story issue | Actor | Need | Reason | Slice budget |
| --- | --- | --- | --- | ---: |
| `#<number>` | `<actor>` | `<need>` | `<reason>` | `<N>` |

## Slice Budget

| Slice | Status | Description | Expected proof |
| ---: | --- | --- | --- |
| 1 | open | `<description>` | `<test|fixture|witness|schema|runtimeBehavior|docUpdate|issueUpdate>` |

## Acceptance Criteria

- [ ] `<criterion>`

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| `<claim>` | `<fixture/input or not applicable>` | `<witness>` | `<command>` | `<stable result>` |

## Observer Geometry

Name the causal basis, aperture, law, projection, support obligations, budget
posture, residual posture, and witness posture for any graph-shaped or
materialized reading claim.

| Reading claim | Basis | Aperture | Law/projection | Support obligations | Witness posture |
| --- | --- | --- | --- | --- | --- |
| `<claim>` | `<basis>` | `<aperture>` | `<law>` | `<support>` | `<witness>` |

## Validation Plan

```bash
<command>
```

## Release Gate Impact

Describe how this goalpost affects the target release gate, release evidence
packet, changelog, docs, package surface, or migration posture.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| `None` | `No accepted residual risks.` | `n/a` | `n/a` |

## Closeout

- [ ] Slices complete or honestly dispositioned.
- [ ] Proof matrix replayed.
- [ ] Goalpost issue updated.
- [ ] Child proof-story issues closed, superseded, or carried forward.
- [ ] Release evidence updated when release-relevant.
- [ ] Retrospective or closeout note written.
````
