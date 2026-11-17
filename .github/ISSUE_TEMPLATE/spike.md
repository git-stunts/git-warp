---
name: Spike
about: Use to test an approach with throwaway code inside a time box. For an answer without code, use Research.
title: ""
labels: ["priority:later", "status:available"]
---

```yaml
.dag: issue-dag/2
.id: git-stunts/git-warp#NEW
.kind: task
.type: spike
.blocked_by: []
```

# Spike

```text
Execute task (<issue title>) in repository git-stunts/git-warp.
1. Read AGENTS.md, docs/plans/README.md, and this issue.
2. Build the approach in 2 as throwaway code on a branch, inside the time box in 2e.
3. Record the result in 2f against the adopt (2b) and reject (2c) conditions.
4. Delete the throwaway code as 2d says, and satisfy every Definition of Done item.
```

<!--
House card: Spike. Keep the frontmatter block first, then the "# Spike"
heading, the text block, and the numbered "## 1." to "## 9." headings. No tool
checks these headings; reviewers do. Section 2 is the card-specific part; its
parts are 2, 2b, 2c, and so on.
Write in ASD-STE100 Simplified Technical English (see
docs/plans/README.md#task-plan-house-format).
Frontmatter: GitHub gives the issue its number when you submit it. Then change
the .id line to this issue, for example git-stunts/git-warp#1234. Until you
do, Taskalisk refuses the block, and every run that includes this issue fails.
Write each prerequisite in .blocked_by as owner/repo#N. Add .holds or .meters
only for a resource that the task holds for its whole duration. See
docs/plans/README.md#task-plan-house-format.
The code this produces is throwaway. Say so under 2d. If you need an
answer, file Research. If you need to try code, file Spike.
Labels: add exactly one type:*. This card has no type:* label of its own: use the
type of the work it gates, usually type:debt or type:feature (type:docs for
documentation work). Keep one status:* and one priority:*, and add one
area:*. The preset priority:later is a placeholder: correct it. Assign the
GitHub Milestone that owns this work. Write "none" or "not applicable,
because X" instead of padding a section.
-->

## 1. Background Context

## 2. The approach being tested
## 2b. What would make us adopt it
## 2c. What would make us reject it
## 2d. What gets deleted afterwards
The code this produces is throwaway. Say so here.
## 2e. Time box
## 2f. Findings

## 3. Prerequisites
Record each prerequisite in .blocked_by in the frontmatter block. List
them here only for the reader, each with the reason it must close first.
- [ ]

## 4. Scope
In:
Out:

## 5. Why now
## 6. Risks
## 7. Definition of Done
Adopt or reject, recorded, and the throwaway deleted.
## 8. Stakeholders
## 9. Related Issues
