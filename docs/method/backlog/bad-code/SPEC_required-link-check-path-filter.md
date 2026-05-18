# SPEC required link check path filter

## Smell

`Check broken links` is a required main-branch context, but the Link
Check workflow was path-filtered to Markdown and `.lychee.toml`
changes. Code-only PRs could pass every relevant CI job and still be
unmergeable because GitHub never received the required status context.

## Paydown

Keep required workflows unfiltered, or move filtering into job-level
logic that still emits the required context on every protected-branch
PR.
