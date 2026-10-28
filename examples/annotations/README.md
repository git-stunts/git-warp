# Annotations example

A multi-writer margin-notes store: documents, threads, comments and replies.
It is the teaching example of the intended git-warp usage: write intents,
observe bounded readings, keep receipts. The model behind it is explained in
[Cone-bounded reads and writes](../../docs/topics/cone-bounded-reads.md).

| File | Role |
| --- | --- |
| `sdk/annotations.graphql` | The single authored domain schema: one Mutation per user action, one Query per bounded question |
| `sdk/annotations.wesley.generated.ts` | Wesley 0.3.0-alpha.1 output: request types and directive metadata |
| `sdk/annotations.generated.ts` | Rendered by `scripts/generated-sdk/RenderAnnotationsSdk.ts`: validated Intent and Observer factories |
| `MarginStore.ts` | Application code: saves user actions, reads one document's margins through four Observers |
| `ReceiptLedger.ts` | Keeps every write and observation receipt |
| `HubSync.ts` | Moves writer chains through a Git hub with the [sync.md](../../docs/topics/sync.md) refspecs |
| `run.ts` | Two clones: open a thread, reply, edit, resolve, delete a comment, sync, read the margins on both clones |

Application files import only `Runtime` and types from `@git-stunts/git-warp`,
plus the generated SDK. Only the generated SDK imports `@git-stunts/git-warp/advanced`.

Run the example in Docker. It typechecks against the built package, then
executes:

```bash
npm run example:annotations
```

It exits 0 only when every receipt settled and both clones read the expected
margins.

Regenerate the SDK after editing the schema. This needs `wesley` 0.3.0-alpha.1
on `PATH`, or `-- --wesley <path>`:

```bash
npm run generate:annotations-sdk
npm run check:annotations-sdk
```
