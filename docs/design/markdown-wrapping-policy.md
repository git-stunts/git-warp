# Markdown Wrapping Policy

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Problem

The repo already keeps `markdownlint` narrow, but that intent is not obvious at the config layer. Contributors can still assume they should hard-wrap prose to some arbitrary line width, which makes the source harder to read in modern Markdown editors and readers.

## Goal

Make the repo's Markdown policy explicit:

- fenced code blocks must still carry language identifiers
- prose should not be hard-wrapped just to satisfy a linter line-length rule
- normal prose should stay unwrapped in source unless structure genuinely benefits from line breaks

## Decisions

1. Keep the repo's Markdown rules narrow and explicit.
2. Disable `MD013` explicitly in `.markdownlint.jsonc` even though `default: false` already implies it.
3. Do not hard-wrap prose in repository Markdown by default.
4. Keep manual line breaks only where Markdown structure benefits from them, such as code fences, lists, tables, and small HTML blocks.
5. Reflow the README so the source matches the intended policy.

## Tests As Spec

The executable contract for this slice should prove:

1. `.markdownlint.jsonc` explicitly disables `MD013`
2. `.markdownlint.jsonc` still enables `MD040`
