---
name: Feature
about: Use when the end state is known and only the work remains.
title: ""
labels: ["type:feature", "priority:later", "status:available"]
---

# Feature

```text
Execute task (<issue title>) in repository git-stunts/git-warp.
1. Read AGENTS.md, docs/plans/README.md, and this issue.
2. <Replace with the steps that do the work.>
3. Satisfy every Acceptance Criteria and Definition of Done item, and attach the evidence to the pull request.
```

<!--
House card: Feature. Keep the "# Feature" heading, the text block, and the
numbered "## 1." to "## 9." headings: the planner checks them. Section 2 is
the card-specific part; its parts are 2, 2b, 2c, and so on.
Write in ASD-STE100 Simplified Technical English (see
docs/plans/README.md#task-plan-house-format).
Labels: keep exactly one type:*, one status:*, and one priority:*, and add one
area:*. The preset priority:later is a placeholder: correct it. Assign the
GitHub Milestone that owns this work. Write "none" or "not applicable,
because X" instead of padding a section.
-->

## 1. Background Context

## 2. Problem Description
## 2b. Proposed Solution
## 2c. Alternatives considered and rejected
One line each.
## 2d. Acceptance Criteria
## 2e. Test Plan
Golden:
Edges:
Known failure modes:
Fuzz and stress:

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
## 8. Stakeholders
## 9. Related Issues
