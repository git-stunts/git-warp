# 2026-03-28 Retrospective: README Wrapping Consistency

**Design:** `docs/design/markdown-wrapping-policy.md`

## What Landed

- [`README.md`](../../README.md) was normalized to the repo's no-hard-wrap prose policy.
- Arbitrary short line breaks in prose paragraphs were removed.
- Structural line breaks were kept where they still help readability, such as HTML blocks, badge rows, code fences, and lists.
- The Markdown wrapping policy note now states the rule more explicitly instead of only implying it through the linter config.

## Design Alignment Audit

- prose should not be hard-wrapped by default: aligned
- structural Markdown blocks may still use manual line breaks: aligned
- the README source now matches the stated policy: aligned

## Drift

- This slice normalized the README and the policy note, not the entire repo.

## Why The Drift Happened

- The repo had already disabled `MD013`, but the README had accumulated mixed styles through successive edits.
- Without an explicit style choice at the source level, contributors were still making local wrapping decisions ad hoc.

## Resolution

- Accept the no-hard-wrap style as the repo default for prose.
- Keep future structural line breaks intentional rather than arbitrary.
