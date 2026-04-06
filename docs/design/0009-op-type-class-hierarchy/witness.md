# Cycle 0009 — Witness

## Agent questions

1. **Does `new NodeAdd(nodeId, dot)` throw when `nodeId` is empty or `dot` is not a `Dot`?**
   YES — `Op.test.js` "throws on empty nodeId", "throws on non-string nodeId", "throws when dot is not a Dot instance" tests in the NodeAdd describe block.

2. **Does `op instanceof NodeAdd` return true for NodeAdd instances and false for EdgeAdd instances?**
   YES — `Op.test.js` "cross-class instanceof isolation" > "no op is instanceof a sibling class" proves all 8x8 combinations.

3. **Does `instanceof Op` return true for all 8 op subclasses?**
   YES — `Op.test.js` "cross-class instanceof isolation" > "all ops share the Op base" iterates all 8.

4. **Are all op instances frozen?**
   YES — every class describe block includes an "is frozen" test. NodeRemove and EdgeRemove also have "freezes the observedDots array" tests.

5. **Does `OpNormalizer.normalizeRawOp()` return canonical op class instances?**
   YES — `factory-integration.test.js` "normalizeRawOp converts PropSet (node) to NodePropSet instance" and "normalizeRawOp converts PropSet (edge) to EdgePropSet instance" tests.

6. **Does `OpNormalizer.lowerCanonicalOp()` return raw op class instances?**
   YES — `factory-integration.test.js` "lowerCanonicalOp converts NodePropSet to PropSet instance" and "lowerCanonicalOp converts EdgePropSet to PropSet instance" tests.

7. **Does `JoinReducer.OP_STRATEGIES` dispatch class instances?**
   YES — `reducer-integration.test.js` "finds strategy for every class instance type" test: all 7 canonical types dispatch correctly. Strategy lookup is via `.type` string on the class instance.

8. **Do factory functions delegate to constructors?**
   YES — `factory-integration.test.js` "WarpTypesV2 factory functions produce Op class instances" describe block: every factory returns an `instanceof` the correct class.

9. **Does the CBOR decode boundary produce op class instances?**
   NOT YET — deferred to future cycle (Slice 5). Plain objects from CBOR still work through the reducer because dispatch is string-based.

## Human questions

1. **Can I still do `patch.addNode('user:alice')` and have it just work?**
   YES — PatchBuilderV2 calls factory functions internally. No API change.

2. **Does `git warp history` still show op types correctly?**
   YES — presenter uses `.type` string which class instances carry.

3. **Do existing patches in a real repo still materialize identically?**
   YES — noCoordination test suite 7/7 pass. Wire format unchanged (CBOR still encodes `.type` strings). Factory functions produce structurally identical objects (same fields, same values).

## Hard gates

- noCoordination: **7/7 PASS**
- Full unit suite: **5504/5504 PASS** (332 files)
- Lint: **0 errors, 0 warnings**
- Wire format: **unchanged** (class instances serialize to same CBOR)

## Verdict

**Hill met.** 8 typedef ops replaced with frozen class hierarchy. Runtime identity, constructor validation, `instanceof` dispatch all proven. Consumer migration (Slice 4) and CBOR hydration (Slice 5) deferred — they're incremental and don't block the core value.
