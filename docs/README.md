# Documentation Index

This file is the canonical map of the `git-warp` documentation corpus.

Not every Markdown file in this repository is equally current. Use this index to
find the live docs first, then move into design history or archive material only
when you need that level of detail.

## Start Here

- [Root README](../README.md)
  Product overview, fit, quick start, and the first-use read model.
- [Guide](GUIDE.md)
  The main API walkthrough for `WarpApp`, `WarpCore`, worldlines, observers,
  reads, writes, and sync.
- [CLI Guide](CLI_GUIDE.md)
  Command-line walkthrough and command reference.

## Primary Product Docs

- [Strands](STRANDS.md)
  Speculative write lanes, braid composition, comparison, transfer planning, and
  the strand surface.
- [TTD](TTD.md)
  The thin debugger/tooling boundary inside `git-warp`.

## Operational And Normative Docs

- [Release Guide](release.md)
  Release and preflight process.
- [Trust Migration](trust/TRUST_MIGRATION.md)
  Migration path for signed trust evidence.
- [Trust Operator Runbook](trust/TRUST_OPERATOR_RUNBOOK.md)
  Operational trust procedures.
- [Protocol Specs](specs/)
  Normative specs such as audit receipts, bisect, content attachment, and trust
  crypto.
- [ADR Registry](../adr/)
  Formal architectural decisions.

## Process And History

- [Design Notes](design/)
  Governing design docs for promoted backlog items and active cycles.
- [Retrospectives](retrospectives/)
  Slice close-out documents with design alignment audits.
- [Completed Roadmap](ROADMAP/COMPLETED.md)
  Archived milestone history.
- [Audits](audits/)
  Historical codebase audits retained for reference.
- [Checklists](checklists/)
  Focused release/readiness checklists kept as supporting records.

## Development Docs

- [Documentation style guide](dev/documentation/style-guide.md)
  Writing standard, audience model, and target information architecture for the
  docs corpus.

## Archive

- [Archive Index](archive/README.md)
  Superseded plans, transcripts, completed checklists, and other historical
  artifacts that should not be used as first-use docs.

## Current Release-Blocker Docs

These files are still in the repo but are under active reconciliation before
`v15`:

- `ARCHITECTURE.md`
- `docs/CLI_GUIDE.md`

They are not junk, but they still need a current-noun and current-surface pass
before release.
