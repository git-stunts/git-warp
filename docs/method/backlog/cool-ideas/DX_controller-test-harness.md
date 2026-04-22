---
id: DX_controller-test-harness
blocked_by: []
blocks: []
---

# Controller test harness — mock host with typed capability surface

## Idea

8 controllers have zero tests because mocking the WarpRuntime host is
painful (30+ fields, private access). What if there were a
ControllerTestHarness class that provides a minimal, typed mock host
with only the fields each controller actually reads? Derive the required
fields automatically from the controller's source (grep for `host._`
access patterns). The harness validates that the mock covers what the
controller needs. Tests become:

```js
const harness = ControllerTestHarness.for(MaterializeController);
harness.host._cachedState = someState;
await harness.controller.materialize();
```

This pairs with `CC_untested-controllers.md` — the harness makes those
tests feasible.
