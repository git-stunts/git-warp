---
name: Decision
about: Use when the facts are known and the open item is which option, and who says so.
title: ""
labels: ["priority:later", "status:available"]
---

```yaml
.dag: issue-dag/2
.id: git-stunts/git-warp#NEW
.kind: task
.type: decision
.blocked_by: []
```

# Decision

```text
Execute task (<issue title>) in repository git-stunts/git-warp.
1. Read AGENTS.md, docs/plans/README.md, and this issue.
2. Get the decision from the person named in 2d, for one of the options in 2b.
3. Record the decision and its reason where the next reader will find it, and link that record here.
4. Satisfy every Definition of Done item, then close this issue.
```

<!--
House card: Decision. Keep the frontmatter block first, then the "# Decision"
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
Labels: add exactly one type:*. This card has no type:* label of its own: use the
type of the work it gates, usually type:debt or type:feature (type:docs for
documentation work). Keep one status:* and one priority:*, and add one
area:*. The preset priority:later is a placeholder: correct it. Assign the
GitHub Milestone that owns this work. Write "none" or "not applicable,
because X" instead of padding a section.
-->

## 1. Background Context

## 2. The choice
A question with named options.
## 2b. Options and consequences
One line each.
## 2c. Rests on
Evidence, cited by something immutable, or a person, named.
## 2d. Who decides, and by when
## 2e. What is blocked until then
## 2f. Reversible

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
Recorded where the next reader will find it, which is usually not only this card.
## 8. Stakeholders
## 9. Related Issues
