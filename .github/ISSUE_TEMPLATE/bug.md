---
name: Bug
about: Use when there is a symptom and no known cause. Diagnosis is required before fix work starts.
title: ""
labels: ["type:bug", "priority:later", "status:available"]
---

<!--
House card: Bug. Write in ASD-STE100 Simplified Technical English.
No Proposed Solution at filing; Diagnosis is required before fix work starts.
Labels: keep exactly one type:*, one priority:*, one status:*, and add one area:*.
Assign the GitHub Milestone that owns this work. Write "none" or
"not applicable, because X" instead of padding a section.
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
Empty at filing. Required before any fix work starts.

## 3. Prerequisites
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
