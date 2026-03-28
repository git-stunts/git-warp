# Markdown Wrapping Policy

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Problem

The repo already keeps `markdownlint` narrow, but that intent is not obvious at
the config layer. Contributors can still assume they should hard-wrap prose to
some arbitrary line width, which makes the source harder to read in modern
Markdown editors and readers.

## Goal

Make the repo's Markdown policy explicit:

- fenced code blocks must still carry language identifiers
- prose should not be hard-wrapped just to satisfy a linter line-length rule

## Decisions

1. Keep the repo's Markdown rules narrow and explicit.
2. Disable `MD013` explicitly in `.markdownlint.jsonc` even though `default:
   false` already implies it.
3. Reflow the README front matter so the source matches the intended policy.

## Tests As Spec

The executable contract for this slice should prove:

1. `.markdownlint.jsonc` explicitly disables `MD013`
2. `.markdownlint.jsonc` still enables `MD040`
