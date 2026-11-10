---
name: Bug
about: Use for a defect. If the cause is not known, Diagnosis is required before fix work starts. If it is known, fill 2f at filing.
title: ""
labels: ["type:bug", "priority:later", "status:available"]
---

# Bug

```text
Execute task (<issue title>) in repository git-stunts/git-warp.
1. Read AGENTS.md, docs/plans/README.md, and this issue.
2. If section 2f Diagnosis is empty, diagnose the cause first and record it there before you change code.
3. Write a regression test that fails before the fix, then make the fix.
4. Satisfy every Definition of Done item, and attach the evidence to the pull request.
```

<!--
House card: Bug. Keep the "# Bug" heading, the text block, and the numbered
"## 1." to "## 9." headings: the planner checks them. Section 2 is the
card-specific part; its parts are 2, 2b, 2c, and so on.
Write in ASD-STE100 Simplified Technical English (see
docs/plans/README.md#task-plan-house-format).
Do not write a Proposed Solution at filing. If the cause is not known,
Diagnosis is required before fix work starts. If you cannot fill Blast
radius, write "unknown"; a maintainer completes it.
Labels: keep exactly one type:*, one status:*, and one priority:*, and add one
area:*. The preset priority:later is a placeholder: correct it. Assign the
GitHub Milestone that owns this work. Write "none" or "not applicable,
because X" instead of padding a section.
-->

## 1. Background Context

## 2. Observed
What happens now.
## 2b. Expected
What should happen instead.
## 2c. Reproduction
Steps, or: not reproduced, observed in production at <time> from <source>.
## 2d. Blast radius
Who is affected, as a population.
How many, with the query that produced the number, marked observed or estimated.
Since when.
Downstream: what consumed the wrong value.
## 2e. Hypothesis
What I think is happening, and the observation that would kill it.
## 2f. Diagnosis
Empty at filing unless the cause is already known. Required before any fix work starts.

## 3. Prerequisites
Record each prerequisite as a GitHub "blocked by" relation. List them here
only for the reader.
- [ ]

## 4. Scope
In:
Out:

## 5. Why now
## 6. Risks
## 7. Definition of Done
A regression test that fails before the fix and passes after it.
## 8. Stakeholders
## 9. Related Issues
