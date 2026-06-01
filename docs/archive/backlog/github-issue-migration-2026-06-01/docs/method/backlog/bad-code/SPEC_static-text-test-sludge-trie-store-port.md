---
id: SPEC_static-text-test-sludge-trie-store-port
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/domain/orset/trie/TrieStorePort.test.ts`

**Effort:** S

The `shape` suite reads `TrieStorePort.ts` and asserts it contains an
`export default interface` declaration and not a class declaration.

Keep the concrete in-memory store behavior tests. Replace declaration
text checks with TypeScript compile-contract tests or a policy scanner
that understands declarations without hard-coded source strings.
