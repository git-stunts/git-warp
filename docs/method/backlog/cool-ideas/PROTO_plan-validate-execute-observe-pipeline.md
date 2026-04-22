---
id: PROTO_plan-validate-execute-observe-pipeline
blocked_by: []
blocks: []
---

# Plan → Validate → Execute → Observe pipeline

The QueryPlan pattern (builder accumulates immutable plan, runner
executes it) is a command pattern. Patches already follow this
(PatchBuilder accumulates, commit executes).

Formalize it system-wide:

```
Plan    — immutable value object describing intent
Validate — check the plan against current state
Execute — apply the plan, produce effects
Observe — stream the results to subscribers
```

Every mutation becomes:
1. `const plan = graph.patches.plan(fn)` — accumulate, freeze
2. `const validation = plan.validate(state)` — pre-flight checks
3. `const result = await plan.execute()` — commit, materialize
4. `graph.subscriptions.notify(result.diff)` — reactive update

Benefits:
- Plans are inspectable before execution (debugging, approval UIs)
- Plans are serializable (undo/redo, collaborative editing)
- Validation is separable from execution (dry-run mode)
- The pipeline is composable (batch plans, conditional plans)

This is how git-warp becomes a proper event-sourced system with
first-class command objects.
