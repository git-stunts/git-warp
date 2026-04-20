# Documentation Corpus Audit

Backlog: `OG-012`
Status: Closed
Date: 2026-03-28

## Problem

The repository currently mixes at least four doc classes together:

1. canonical user-facing docs
2. operational and normative docs
3. design / retrospective process records
4. historical or superseded artifacts

When those classes live side-by-side without an explicit taxonomy, readers
cannot tell what is current, what is historical, and what should no longer be
used to learn the public API.

That is especially dangerous now because `v15` is intentionally changing the
public surface:

- `WarpApp` / `WarpCore`
- `Worldline`
- `Aperture`
- `Observer`
- `Strand`

The docs corpus must stop implying that every Markdown file in `docs/` is
equally current.

## Sponsor Perspectives

- sponsor human: developer evaluating or adopting `git-warp`
- sponsor agent: coding agent inferring how to use the public API safely
- sponsor maintainer: release owner deciding what is canonical for `v15`

## Hills

- As a new user, I can identify the canonical docs set without browsing the
  entire repo history.
- As an agent, I can distinguish current public docs from archival or
  superseded material.
- As a maintainer, I can add new docs without worsening corpus drift.

## Non-Goals

- rewriting every historical design note into current nouns
- deleting legitimate design or retrospective history
- building the browser docs catalog/playground in this slice

## Decisions

### 1. The docs corpus needs an explicit taxonomy

The repo will distinguish these classes clearly:

- canonical docs
- operational/spec docs
- process/history docs
- archive docs

### 2. Top-level `docs/` should favor current docs, not archaeology

The top level of `docs/` should contain current or intentionally current-facing
material, for example:

- `GUIDE.md`
- `CLI_GUIDE.md`
- `STRANDS.md`
- `TTD.md`
- `release.md`
- trust/operator docs grouped under `docs/trust/`

Historical one-off plans, transcripts, and completed checklists should not live
at that same level.

### 3. Historical but still useful material should be archived, not deleted blindly

Some documents are not current onboarding/reference docs, but they still have
historical value:

- audit transcripts
- frozen implementation plans
- superseded drafts
- completed cleanup checklists

These should move under `docs/archive/` instead of disappearing.

### 4. Design and retrospective directories are valid history, not user docs

The following directories stay in-repo and stay discoverable:

- `docs/design/`
- `docs/archive/retrospectives/`

But they should not be mistaken for first-use product docs.

### 5. The docs corpus needs an index

Add `docs/README.md` as the canonical map for the documentation set, including:

- where new users should start
- which docs are public API / product docs
- which docs are operational/spec references
- where historical material lives

### 6. This slice identifies release blockers and sends them into a focused follow-on rewrite

Current release-blocking doc drift discovered during the audit:

- `ARCHITECTURE.md` still teaches `WarpGraph`, `strand`, and outdated
  layering.
- `docs/CLI_GUIDE.md` still teaches `WarpGraph` and old examples.

Those docs were later reconciled in
[architecture-and-cli-guide-rewrite.md](architecture-and-cli-guide-rewrite.md).

### 7. Documentation governance needs a maintainer-facing home

Add a maintainer-facing documentation guide under:

- `.github/maintainers/documentation/`

That guide should establish:

- writing standards
- audience boundaries
- target information architecture
- archive expectations

### 8. The docs architecture should separate users, theory, tooling, and maintainers

The target live structure should move toward explicit homes for:

- getting started / onboarding
- app-facing docs
- core/tooling docs
- patterns
- reference
- machine-readable reference
- theory
- maintainer docs
- archive

## Initial Classification

### Canonical product docs

- `README.md`
- `docs/README.md`
- `docs/GUIDE.md`
- `docs/CLI_GUIDE.md`
- `docs/STRANDS.md`
- `docs/TTD.md`

### Operational and normative docs

- `docs/release.md`
- `docs/specs/`
- `docs/trust/`
- `docs/archive/adr/`

### Process and historical design docs

- `docs/design/`
- `docs/archive/retrospectives/`
- `docs/ROADMAP/COMPLETED.md`
- `docs/audits/`
- `docs/checklists/`

### Archive docs

- `docs/archive/`

## Immediate Moves In This Slice

- add `docs/README.md`
- add `docs/archive/README.md`
- add `.github/maintainers/documentation/style-guide.md`
- move obvious historical clutter out of top-level `docs/`
- delete `.DS_Store`
- add executable checks for the docs taxonomy

## Follow-On Work

- completed: reconcile `ARCHITECTURE.md` with `WarpApp` / `WarpCore` / `Strand`
- completed: reconcile `docs/CLI_GUIDE.md` with current public nouns and command families
- decide whether any additional root docs should be archived or rewritten
