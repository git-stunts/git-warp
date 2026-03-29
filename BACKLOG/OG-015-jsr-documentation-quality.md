# OG-015 — Raise JSR documentation quality score

Status: DONE

Legend: Observer Geometry

## Problem

`v15.0.1` fixed the release-surface problems that made npm and JSR publish too
much internal material, and it fixed JSR's `No slow types are used` warning.

But JSR still reports that only about 67% of exported symbols are documented.
That means the package is now publishable and structurally cleaner, while still
leaving too much of the public surface under-documented in IDE hovers and JSR's
generated API docs.

This is a real quality gap for a package whose public surface is now explicitly
split into:

- `WarpApp`
- `WarpCore`
- `Worldline`
- `Lens`
- `Observer`
- `Strand`

If those nouns and their surrounding helpers are not documented consistently,
the docs pipeline and the type surface drift apart again.

## Why this matters

The repo now has a much stronger user-facing documentation pipeline, but JSR
and editor hovers are part of the real product surface too.

Improving symbol docs would:

- increase discoverability for builders reading the API from their editor
- make JSR-generated reference pages more useful
- reduce the need to jump from code completion into source files
- keep the public noun cuts (`WarpApp`, `WarpCore`, `Strand`, `Lens`, etc.)
  legible at the type level
- reinforce the builder-first documentation posture established in `v15`

## Current state

As of `v15.0.1`:

- JSR dry-run passes
- the slow-type warning is resolved via self-type bindings on JavaScript
  entrypoints
- the package README and module docs are present
- many exported symbols still lack symbol-level doc comments
- some public type descriptions are accurate but too terse to be useful as
  standalone hover docs

## Desired outcome

Raise the documentation quality of the exported public surface until the
generated reference feels intentional rather than incidental.

Likely shape:

- audit the exported symbols in `index.d.ts`
- add or improve doc comments for major public classes, methods, and types
- prioritize the main builder and tooling entrypoints first
  - `WarpApp`
  - `WarpCore`
  - `Worldline`
  - `Observer`
  - `Lens`
  - `Strand`
  - writer / patch APIs
  - query / traversal result shapes
- tighten module docs on secondary entrypoints where needed
- re-run `jsr publish --dry-run` until documentation coverage crosses the JSR
  threshold and the generated output reads cleanly

## Acceptance criteria

1. JSR documentation coverage rises above the current failing threshold.
2. Major public symbols have meaningful hover docs, not placeholder prose.
3. Public docs and type-surface docs use the same nouns and conceptual model.
4. Secondary entrypoints keep valid module docs.
5. New doc comments stay builder-first and do not reintroduce paper-heavy
   framing into the main API reference surface.

## Non-goals

- rewriting the entire docs site or public guide corpus again
- documenting private or internal-only helpers as if they were public API
- treating JSR score-chasing as more important than accurate public semantics

## Notes

This item is specifically about public type-surface and JSR documentation
quality.

It is related to, but separate from:

- `OG-011-public-api-catalog-and-playground.md`
- `OG-012-documentation-corpus-audit.md`

Those items are about broader documentation architecture.
This item is about the publish-time API documentation quality bar.
