# OG-012 — Audit And Reconcile The Documentation Corpus Before v15

Status: DONE

## Problem

The repo's documentation corpus has grown organically across multiple release
tranches.

That left three different doc classes mixed together in the same visible
surface:

- current user-facing docs
- historical design / milestone / runbook material
- superseded or one-off artifacts that still look "live" because they sit at
  the top of `docs/`

Before `v15.0.0`, the docs set needs to become intentional.

## Why This Matters

If the repository does not make it clear which docs are canonical, both humans
and agents will read the wrong thing:

- app builders will learn outdated nouns or workflows
- agentic consumers will infer the wrong public API surface
- maintainers will keep accreting new docs into an already muddy structure

This is a release-quality problem, not just housekeeping.

## Desired Outcome

- define the canonical documentation set for `v15`
- separate live docs from archived/historical material
- remove obvious trash from the repo surface
- make the docs taxonomy explicit in-repo
- add executable checks so the corpus does not drift back into a pile

## Promotion

Promoted to:

- [docs/design/documentation-corpus-audit.md](../docs/design/documentation-corpus-audit.md)
- [docs/design/architecture-and-cli-guide-rewrite.md](../docs/design/architecture-and-cli-guide-rewrite.md)
