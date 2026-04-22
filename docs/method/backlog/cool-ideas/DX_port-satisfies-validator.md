---
id: DX_port-satisfies-validator
blocked_by: []
blocks: []
feature: observer-admission-runtime
---

# satisfies-based port validation for plain-object adapters

**Audit ref:** CQ01-2.2

Port abstractions are `abstract class` per SSTS doctrine. This means
consumers implementing custom adapters must extend the class rather
than implementing an interface. Testing with plain object mocks requires
`as unknown as`, which is cast-cosplay.

## Proposal

Add a `satisfies` or validation function pattern that lets consumers
verify a plain object implements a port contract without class
inheritance:

```ts
import { validatePort } from '@git-stunts/git-warp';

const myAdapter = validatePort(GraphPersistencePort, {
  commitNode: async (...) => { ... },
  showNode: async (...) => { ... },
  // ...
});
```

This preserves SSTS (classes are the real contracts) while reducing
friction for test mocks and lightweight adapter implementations.
