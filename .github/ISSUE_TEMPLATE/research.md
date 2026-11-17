---
name: Research
about: Use when there is one answerable question and a decision waits on the answer. To try code, use Spike.
title: ""
labels: ["priority:later", "status:available"]
---

```yaml
.dag: issue-dag/2
.id: git-stunts/git-warp#NEW
.kind: task
.type: research
.blocked_by: []
```

# Research

```text
Execute task (<issue title>) in repository git-stunts/git-warp.
1. Read AGENTS.md, docs/plans/README.md, and this issue.
2. Use the method in 2c to answer the question in 2. Do not change product code.
3. Record the value, the command that produced it, and the timestamp under 2f.
4. Satisfy every Definition of Done item, then close this issue.
```

<!--
House card: Research. Keep the frontmatter block first, then the "# Research"
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
If no decision waits on the answer, do not file this. If you need an answer,
file Research. If you need to try code, file Spike.
Labels: add exactly one type:*. This card has no type:* label of its own: use the
type of the work it gates, usually type:debt or type:feature (type:docs for
documentation work). Keep one status:* and one priority:*, and add one
area:*. The preset priority:later is a placeholder: correct it. Assign the
GitHub Milestone that owns this work. Write "none" or "not applicable,
because X" instead of padding a section.
-->

## 1. Background Context

## 2. The Question
One sentence, answerable.
## 2b. What decision waits on it
If nothing does, do not file this.
## 2c. What would settle it
The observation, the method, and where the data lives.
## 2d. Aperture
What this cannot see, so a negative result is not read as a positive.
## 2e. Possible answers and what each implies
Written before looking.
## 2f. Evidence
Empty at filing. The value, the command that produced it, the timestamp.

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
An answer under Evidence, or a declared unanswerable-because.
## 8. Stakeholders
## 9. Related Issues
