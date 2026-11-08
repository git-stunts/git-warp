---
name: Investigation
about: Use when a system matters but we do not yet know what questions to ask about it. For one question, use Research.
title: ""
labels: ["priority:later", "status:available"]
---

# Investigation

```text
Execute task (<issue title>) in repository git-stunts/git-warp.
1. Read AGENTS.md, docs/plans/README.md, and this issue.
2. Examine the places in 2b inside the time box in 2c. Do not change product code.
3. Record each finding in 2d, and file one typed house card for each finding.
4. Satisfy every Definition of Done item, then close this issue.
```

<!--
House card: Investigation. Keep the "# Investigation" heading, the text block, and the numbered
"## 1." to "## 9." headings: the planner checks them. Section 2 is the
card-specific part; its parts are 2, 2b, 2c, and so on.
Write in ASD-STE100 Simplified Technical English (see
docs/plans/README.md#task-plan-house-format).
If you have one question, file Research instead.
Labels: add exactly one type:*. This card has no type of its own: use the
type of the work it gates, usually type:debt or type:feature (type:docs for
documentation work). Keep one status:* and one priority:*, and add one
area:*. The preset priority:later is a placeholder: correct it. Assign the
GitHub Milestone that owns this work. Write "none" or "not applicable,
because X" instead of padding a section.
-->

## 1. Background Context
The system, and why we are taking it on.

## 2. What we do not understand
The area, not a question. If you have one question, file Research instead.
## 2b. Where to look
Surfaces, repositories, dashboards, people.
## 2c. Time box
## 2d. Findings
Empty at filing. One line per finding, each with the card it became.

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
The map exists and every finding has a typed card.
## 8. Stakeholders
## 9. Related Issues
