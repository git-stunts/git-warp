# Documentation style guide

This document is the first canonical guide for how `git-warp` documentation
should be written and organized.

Use it before rewriting or adding docs. The goal is to keep the documentation
corpus cohesive, intentional, and usable for both humans and agents.

## Purpose

This guide standardizes four things:

1. writing style
2. audience boundaries
3. documentation taxonomy
4. information architecture

The repo already contains design notes, retrospectives, specs, and product
docs. Without an explicit standard, those artifacts drift together and readers
cannot tell what is current, what is theory, and what is only useful to
maintainers.

## Writing principles

- Use a friendly, encouraging tone.
- Speak directly to the reader as `you`.
- Keep sentences and paragraphs short.
- Prefer clarity over cleverness.
- Remove unnecessary words.
- Use progressive disclosure: define a noun before using it heavily.
- Use sentence case for headings.
- Use code font for exported nouns and API names such as `WarpApp`,
  `WarpCore`, `Worldline`, `Aperture`, `Observer`, and `Strand`.
- Keep one page focused on one job.
- Make cost explicit when a surface is advanced, inspection-oriented, or
  substrate-level.

## Public writing rules

- Public onboarding docs should teach usage, not internal implementation.
- Public docs should not assume the reader already knows WARP theory.
- Theory belongs in theory docs, not in getting-started pages.
- Removed public nouns should not be taught in current docs.
- Examples should answer a concrete user question whenever possible.
- When an example produces data, show the result shape or output shape right
  next to the code unless it is obvious from the code itself.

In practice, a public example should usually answer one of these questions:

- how do you write data?
- how do you read data?
- how do you query or traverse?
- how do you sync?
- how do you use `Strand`?
- how do you use `WarpCore` for explicit tooling or substrate work?

If an example does not help answer one of those questions, it may belong in
theory, reference, or maintainer documentation instead.

## Audience model

The docs corpus serves four primary audiences.

### Builders

These are developers evaluating or adopting `git-warp` for real applications.

They primarily need:

- onboarding
- product-facing API docs
- examples and patterns
- reference material

### Tooling and TTD consumers

These are debugger, provenance, and replay consumers such as `warp-ttd`.

They primarily need:

- `WarpCore`
- materialization and replay
- provenance and receipts
- comparison and transfer facts
- machine-readable reference artifacts

### Theory readers

These readers want the deeper WARP model:

- observer geometry
- holography
- optics
- provenance theory

Theory docs are valid and important, but they should not be confused with
first-use onboarding.

### Maintainers

These readers are working on `git-warp` itself.

They need:

- contribution and release process
- documentation guidance
- design notes
- retrospectives
- backlog and roadmap artifacts

## Documentation taxonomy

The documentation corpus should distinguish these classes clearly:

- user-facing docs
- theory docs
- machine-readable reference docs
- internal development docs
- archive docs

Not every Markdown file in the repo is equally current. The docs structure
should make that obvious.

## Target information architecture

This is the intended documentation layout for the live corpus.

- `docs/README.md`
  Canonical docs index.
- `docs/getting-started/`
  First-use onboarding and early tutorial flow.
- `docs/app/`
  Product-facing docs for `WarpApp`, `Worldline`, `Aperture`, `Observer`, `Strand`,
  braid patterns, and app-shaped usage.
- `docs/core/`
  Advanced substrate docs for `WarpCore`, materialization, receipts,
  provenance, comparison, transfer plans, and playback coordination.
- `docs/patterns/`
  Reusable flows and end-to-end usage patterns.
- `docs/reference/`
  CLI and API reference.
- `docs/reference/machine/`
  Generated machine-readable artifacts for agents and tooling.
- `docs/theory/`
  WARP theory and deeper conceptual material.
- `.github/maintainers/`
  Maintainer-facing docs, including this style guide.
- `docs/archive/`
  Superseded or historical material that should not be treated as current
  onboarding or reference.

This is the target architecture. The repo does not need to move every file into
that structure in one slice, but new docs work should move toward it.

## Current project artifacts that stay in place

The following development-process artifacts remain valid and should stay
discoverable:

- `BACKLOG/`
- `docs/design/`
- `docs/archive/retrospectives/`

They are not first-use product docs, but they are important project artifacts.

## Naming and formatting conventions

- Use lowercase kebab-case for directories and file names.
- Avoid spaces in filesystem paths.
- Prefer stable names over trendy names.
- Use Markdown for human-facing docs unless a machine-readable format is
  clearly better.
- Machine-readable docs should be generated where possible rather than
  hand-maintained.

## Separation rules

### User-facing docs

These should teach people how to use the system.

They should answer:

- what `git-warp` is
- why you would use it
- how the main APIs work
- what path to follow first

They should not require readers to understand internal architecture first.

### Theory docs

These should go deep when needed, but should stay clearly separated from
getting-started content.

### Agent-native docs

These should optimize for machine consumption and stable structure. JSON or
other generated formats are acceptable when useful.

### Internal development docs

These exist to help maintain and evolve `git-warp`. They do not need to be part
of the first-use user journey.

## Change-management rules

- Rewrite front-door docs against this guide before release.
- Archive superseded docs or remove redundant live copies when the Git history
  is already the appropriate archive.
- Do not let archived material sit beside current onboarding/reference docs.
- When a public noun changes, update current product docs, current reference
  docs, and the docs index in the same slice.
- When in doubt, prefer fewer current docs with clearer roles over a large pile
  of overlapping pages.
