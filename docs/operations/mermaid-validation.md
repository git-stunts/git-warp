# Mermaid validation lifecycle

`npm run lint:mermaid` renders every Mermaid block discovered in repository
Markdown with the installed Mermaid CLI and an owned headless browser. It
reports success only after rendering completes, the worker closes, and its
owned process groups have been reclaimed. Existing SVG files alone never
satisfy this gate.

Rendering, including browser launch, has a 120-second deadline. After the
worker reports render completion or failure, browser shutdown has a separate
10-second deadline. Reclamation receives a final one-second budget: request
worker cancellation, allow a short graceful exit, terminate
owned groups, and verify that those groups are gone. Windows tree termination
uses a bounded `taskkill /T /F` call within the remaining reclamation budget.

Diagnostics distinguish render failures and deadlines, browser-shutdown
failures and deadlines, interruptions, and failed process reclamation.
`SIGINT` and `SIGTERM` fail validation and enter the same reclamation path.
The supervisor records the native browser PID synchronously before waiting for
its endpoint or worker connection, so failed startup IPC cannot orphan it.
Browser profiles and render artifacts live in the validator's temporary
directory, which is removed afterward.

Run regression checks through Docker:

```sh
bash scripts/run-in-docker.sh npx vitest run \
  test/unit/scripts/mermaid-shutdown.test.ts \
  test/unit/scripts/MermaidRenderSupervisor.test.ts --maxWorkers=1
```

The controlled close-stall test first produces a real SVG, then blocks
`browser.close()`. It requires a bounded nonzero validator exit, a shutdown
diagnostic, and reclamation of the actual browser. Worker controls also cover
surviving descendants on success, render and shutdown failure, interruptions,
invalid progress, kernel errors, and uncertain reclamation. The Windows
command policy is exercised with controlled process-boundary responses in
Linux Docker; that is not an actual Windows runtime claim.
