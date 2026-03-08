# Browsa Architecture Pivot — Task Plan

Branch: `feat/browsa-serve`

## Goal

Transform browsa from a self-contained in-memory demo into a real developer tool.
The browser connects to a local `git warp serve` process over WebSocket, viewing
and mutating live graph data from a real Git repository.

## Architecture

```
Browser (Vite + Vue)                    Server (Node/Bun/Deno)
┌──────────────────────┐               ┌──────────────────────────┐
│ WarpSocket client    │◄──websocket──►│ WarpServeService         │
│ graphStore.js        │               │   ├─ graph.subscribe()   │
│ GraphCanvas (ELK+SVG)│               │   ├─ graph.materialize() │
│ Inspector            │               │   ├─ graph.createPatch() │
│ Controls / TimeSlider│               │   └─ graph.getNodeProps()│
└──────────────────────┘               ├──────────────────────────┤
                                       │ WebSocketServerPort      │
                                       │   └─ NodeWsAdapter (ws)  │
                                       ├──────────────────────────┤
                                       │ GitGraphAdapter          │
                                       │   └─ real .git repo      │
                                       └──────────────────────────┘
```

## Protocol (v1)

Versioned JSON envelope: `{ v: 1, type: string, id?: string, payload: unknown }`

### Server → Client

| Type      | Payload                                          | When                          |
|-----------|--------------------------------------------------|-------------------------------|
| `hello`   | `{ protocol: 1, graphs: string[] }`              | On connect                    |
| `state`   | `{ graph, nodes, edges, frontier }`              | Response to `open` or `seek`  |
| `diff`    | `{ graph, diff: StateDiffResult }`               | Live push on graph change     |
| `ack`     | `{ sha }` or `{ result }`                        | Response to `mutate`          |
| `inspect` | `{ graph, nodeId, props }`                       | Response to `inspect`         |
| `error`   | `{ code, message }`                              | On failure                    |

### Client → Server

| Type      | Payload                                          | When                          |
|-----------|--------------------------------------------------|-------------------------------|
| `open`    | `{ graph, writerId }`                            | Subscribe to a graph          |
| `mutate`  | `{ graph, ops: [{op, args}] }`                   | Batch of mutations            |
| `seek`    | `{ graph, ceiling }`                             | Time travel                   |
| `inspect` | `{ graph, nodeId }`                              | Get full node properties      |

---

## Tasks

### T1 — WebSocketServerPort + WarpServeService ✅ DONE

**Commit:** `e64b979`

**What was built:**
- `src/ports/WebSocketServerPort.js` — abstract port with `createServer(onConnection)` returning `{ listen, close }`. Connection objects expose `send`, `onMessage`, `onClose`, `close`.
- `src/domain/services/WarpServeService.js` — domain service wiring WarpGraph to the WS port. Handles all protocol message types. Multi-graph aware. Version-guarded. Subscribes to each graph via `graph.subscribe()` and broadcasts diffs to clients that have opened that graph.
- `test/unit/ports/WebSocketServerPort.test.js` — 1 contract test.
- `test/unit/domain/services/WarpServeService.test.js` — 20 behavior tests covering construction, connection lifecycle, all protocol types, live diff push, graph isolation, malformed messages, shutdown.

**Key design decisions:**
- `_onMessage` is async; the `onMessage` callback wraps it with `.catch()` to prevent unhandled rejections.
- `serializeState()` converts `WarpStateV5` (ORSet/LWW internals) into plain JSON with `{ nodes: [{ id, props }], edges: [{ from, to, label }], frontier }`.
- `_broadcastDiff()` only sends to clients whose `openGraphs` set includes the changed graph.

---

### T2 — Node WebSocket Adapter ✅ DONE

**Commit:** `8ed8c64`
**Status:** DONE

**Goal:** Implement `WebSocketServerPort` for Node.js using the `ws` npm package.

**Files to create:**
- `src/infrastructure/adapters/NodeWsAdapter.js`
- `test/unit/infrastructure/adapters/NodeWsAdapter.test.js`

**Behavior to test:**
- Is an instance of `WebSocketServerPort`
- `createServer()` returns a handle with `listen()` and `close()`
- `listen()` starts a WebSocket server on the specified port
- Incoming connections produce `WsConnection` objects
- `conn.send()` delivers a text message to the client
- `conn.onMessage()` receives text messages from the client
- `conn.onClose()` fires when the client disconnects
- `close()` shuts down the server cleanly
- Integration test: open a real WebSocket client (`globalThis.WebSocket` or `ws`), exchange messages, verify round-trip

**Implementation notes:**
- `ws` package: add as a dependency in `package.json`. It's MIT licensed, zero native deps, widely used.
- Follow the `NodeHttpAdapter` pattern in `src/infrastructure/adapters/NodeHttpAdapter.js`.
- The adapter wraps `ws.WebSocketServer` and maps its event-based API to the port's callback API.
- `listen()` should return a Promise that resolves with `{ port, host }` once the server is listening.
- Handle `ws` events: `'connection'` → create `WsConnection`, `ws.on('message')` → `onMessage`, `ws.on('close')` → `onClose`.

**Cross-runtime note:** This adapter is Node-specific. Bun and Deno adapters are deferred (T10). The port abstraction makes this a drop-in swap later.

---

### T3 — CLI Command: `git warp serve` ✅ DONE

**Commit:** `0ea9e01`
**Status:** DONE

**Goal:** Add `serve` as a CLI command so users can run `git warp serve` to start the WebSocket server.

**Files to create/modify:**
- `bin/cli/commands/serve.js` — command handler
- `bin/cli/schemas.js` — add `serveSchema` (Zod)
- `bin/cli/commands/registry.js` — register `serve` command
- `bin/cli/infrastructure.js` — add `serve` to `HELP_TEXT`
- `test/bats/` — BATS integration test (if feasible; may need to test start+stop lifecycle)

**CLI interface:**
```
git warp serve [--port <number>] [--graph <name>] [--host <addr>] [--open]
```
- `--port` (default: `3000`) — WebSocket server port
- `--graph` (optional) — scope to a single graph; omit to serve all graphs in the repo
- `--host` (default: `127.0.0.1`) — bind address
- `--open` (deferred to T9) — auto-open browser

**Behavior to test:**
- Without `--graph`: discovers all graphs via `listGraphNames()`, opens each with `WarpGraph.open()`, passes all to `WarpServeService`
- With `--graph myGraph`: opens only that graph
- Prints `Listening on ws://127.0.0.1:3000` to stderr on start
- Stays alive (does not call `process.exit()` like other commands)
- `SIGINT` / `SIGTERM` → calls `service.close()` then exits cleanly
- Invalid port → `CliError`
- No graphs found → `CliError`

**Implementation notes:**
- The `serve` command is special: it's long-running. The entrypoint (`warp-graph.js`) currently calls `process.exit()` after command completion. The serve handler must signal that it's long-running, or the entrypoint must be modified to not exit when the command doesn't return a result.
- One approach: `handleServe` returns a Promise that never resolves (until signal). The entrypoint awaits it, so `process.exit()` is never reached.
- Writer ID for graph.open: use `generateWriterId()` — the server itself doesn't write, but `WarpGraph.open()` requires one. Alternatively, open in read-only mode if supported, or use a sentinel ID like `serve:<hostname>`.
- The serve command should NOT be added to `VIEW_SUPPORTED_COMMANDS`.

**Dependency:** T2 (needs `NodeWsAdapter` to actually start a server)

---

### T4 — Browser Client: WarpSocket ✅ DONE

**Commit:** `d684bda`
**Status:** DONE

**Goal:** Create a WebSocket client class for the browser that connects to `git warp serve` and handles the protocol.

**Files to create:**
- `demo/browsa/src/net/WarpSocket.js`

**API surface:**
```js
const ws = new WarpSocket('ws://localhost:3000');
ws.onHello((payload) => { /* { protocol, graphs } */ });
ws.onState((payload) => { /* { graph, nodes, edges, frontier } */ });
ws.onDiff((payload) => { /* { graph, diff } */ });
ws.onError((payload) => { /* { code, message } */ });
ws.onDisconnect(() => { /* cleanup */ });

// Request-response (returns Promise resolved by matching `id`)
await ws.open({ graph: 'default', writerId: 'browser-abc' });
await ws.mutate({ graph: 'default', ops: [...] });
await ws.seek({ graph: 'default', ceiling: 5 });
const props = await ws.inspect({ graph: 'default', nodeId: 'user:alice' });
```

**Behavior to test:**
- Test file: `demo/browsa/test/WarpSocket.test.js` (or under main test dir)
- Uses a mock WebSocket (not real network) to test protocol handling
- `open()` sends `{ v:1, type:'open', id, payload }` and resolves when server responds with `state`
- `mutate()` sends and resolves on `ack`
- `inspect()` sends and resolves on `inspect` response
- `seek()` sends and resolves on `state` response
- Incoming `diff` messages fire `onDiff` callback
- Incoming `error` with matching `id` rejects the pending Promise
- Reconnect with exponential backoff on disconnect (use `@git-stunts/alfred` retry logic or simple built-in)
- Connection timeout → error callback

**Implementation notes:**
- Uses `globalThis.WebSocket` (available in all browsers).
- Correlation IDs: use a monotonic counter (`req-1`, `req-2`, ...). Store pending promises in a `Map<string, { resolve, reject }>`. On incoming message, if `msg.id` matches a pending request, resolve/reject it. If no `id`, it's a push (diff/error).
- Reconnect: on `ws.onclose`, wait with backoff, then re-establish. On reconnect, automatically re-send `open` for all previously opened graphs.

**Dependency:** None (can develop against mock WebSocket in tests)

---

### T5 — Rewire graphStore.js + Components ✅ DONE

**Status:** DONE

**Goal:** Replace the in-memory `WarpGraph` usage in `graphStore.js` with `WarpSocket` calls. Rewire all components for single-viewport, WebSocket-backed operation.

**What was done:**
- `graphStore.js` — Complete rewrite. Removed all in-memory WarpGraph, CRDT, sync, and scenario infrastructure. New state: connection status, server URL, available graphs, single active graph, nodes/edges/inspectedProps. Uses `WarpSocket` for all communication. Reads server URL from `?server=` param / localStorage. Generates/persists writerId via `crypto.randomUUID()` + localStorage. Incremental diff application via `handleDiff()`. Time-travel via `socket.seek()`. Node inspection via `socket.inspect()`.
- `App.vue` — Replaced 4-viewport grid with single full-height `GraphViewport`. Added connection bar (status dot, server URL, graph dropdown, writerId badge). Removed `ScenarioPanel` and "Sync All" button. Shows reconnect prompt when disconnected.
- `Controls.vue` — Removed `viewportId` prop, sync buttons, online/offline toggle. Operates directly on store.
- `GraphViewport.vue` — Removed `viewportId` prop and viewport lookup. Reads directly from store.
- `Inspector.vue` — Removed viewport-based prop extraction. Displays `store.inspectedProps` (real server data). Removed `viewportId` prop.
- `TimeSlider.vue` — Removed `viewportId` prop. Reads `store.maxCeiling` and calls `store.setCeiling()` directly.
- Deleted `ScenarioPanel.vue`, `InProcessSyncBus.js`, `InsecureCryptoAdapter.js`.

**Dependency:** T4 (WarpSocket)

---

### T6 — Rewire Inspector ✅ DONE (absorbed into T5)

**Status:** DONE — Inspector rewire was included in the T5 component rewrite.

**What was done:**
- `Inspector.vue` now uses `store.inspectedProps` (populated by `socket.inspect()`) to display all server-reported properties, not just hardcoded id/color/label.
- `selectNode()` in graphStore sends an `inspect` request and stores the result.
- Edge connections still derived from `store.edges` (already available from `state`/`diff` messages).
- Provenance display deferred to T9 or later.

---

### T7 — Simplify Vite Config and Clean Up ✅ DONE

**Commit:** `7acbd96`
**Status:** DONE

**Goal:** The Vite config currently stubs out a dozen Node modules because git-warp runs in the browser. With the server pivot, the browser no longer imports git-warp at all — it only uses `WarpSocket`.

**Files to modify:**
- `demo/browsa/vite.config.js` — remove most aliases/stubs
- `demo/browsa/package.json` — remove unnecessary deps, add `ws` if needed for dev
- `demo/browsa/src/stubs/` — delete entire directory

**Files to delete:**
- `demo/browsa/src/stubs/empty.js`
- `demo/browsa/src/stubs/node-crypto.js`
- `demo/browsa/src/stubs/node-module.js`
- `demo/browsa/src/stubs/node-stream.js`
- `demo/browsa/src/sync/InsecureCryptoAdapter.js`
- `demo/browsa/src/sync/InProcessSyncBus.js`

**What remains in vite.config.js:**
- Vue plugin
- `es2022` target (for top-level await if needed)
- Dev server proxy: proxy `ws://localhost:5173/ws` to the `git warp serve` port (so Vite HMR and WS share the same origin, avoiding CORS)

**Dependency:** T5 (must be done after graphStore rewrite, since the old code depends on these stubs)

---

### T8 — Connection Status UI ✅ DONE

**Status:** DONE — Already implemented during T5. `App.vue` has green/yellow/red status dot, server URL display, graph selector dropdown, writer ID badge, error bar, and disconnected prompt with reconnect button.

**Goal:** Show the user whether the browser is connected to the server, and handle disconnection gracefully.

**Files to modify:**
- `demo/browsa/src/App.vue` — add connection status bar
- `demo/browsa/src/stores/graphStore.js` — expose connection state

**Behavior:**
- Green dot + "Connected" when WebSocket is open
- Yellow dot + "Reconnecting..." during backoff
- Red dot + "Disconnected" when connection is lost and not retrying
- Show server URL (e.g., `ws://localhost:3000`)
- Show which graph is open and writer ID

**Dependency:** T5

---

### T9 — Polish and Ship ✅ DONE

**Status:** DONE

**Goal:** Final polish before merging to main.

**Items:**
- `--open` flag on `git warp serve`: auto-launch browser to the Vite dev server URL (or a built `index.html` served by the WS server itself)
- Update `CHANGELOG.md` with the browsa pivot
- Update `README.md` — add `git warp serve` to the CLI section
- Update `ROADMAP.md` — mark B157 phases as complete, add new items if needed
- Update `HELP_TEXT` in `infrastructure.js`
- Run full test suite (`npm test`, `npm run lint`, BATS)
- Check that existing tests still pass (no regressions from new deps)
- `demo/browsa/package-lock.json` — should this demo become a pnpm workspace member? If so, delete the lockfile and add to `pnpm-workspace.yaml`. (Per CLAUDE.md: monorepo packages use pnpm, lock-step versioning.)
- Verify the demo works end-to-end: `git warp serve` in one terminal, `cd demo/browsa && npm run dev` in another, open browser

**Dependency:** T1–T8 all complete

---

### T10 — Bun + Deno WebSocket Adapters ✅ DONE

**Status:** DONE

**What was built:**
- `src/infrastructure/adapters/BunWsAdapter.js` — Bun WebSocket adapter using `Bun.serve()` with `websocket` handler option. Stores per-connection handler refs on `ws.data`.
- `src/infrastructure/adapters/DenoWsAdapter.js` — Deno WebSocket adapter using `Deno.serve()` + `Deno.upgradeWebSocket()`. Wraps standard browser-like `WebSocket` into port-compliant connection.
- `bin/cli/commands/serve.js` — runtime detection via `createWsAdapter()`: checks `globalThis.Bun` → `globalThis.Deno` → Node fallback. Dynamic imports ensure only the relevant adapter and its deps are loaded.
- `src/globals.d.ts` — added `BunServerWebSocket`, `BunWsData`, `BunWebSocketHandlers`, `BunServer.upgrade()`, and `Deno.upgradeWebSocket()` type declarations.
- `test/unit/infrastructure/adapters/BunWsAdapter.test.js` — 13 tests with mock `Bun.serve()`.
- `test/unit/infrastructure/adapters/DenoWsAdapter.test.js` — 13 tests with mock `Deno.serve()`/`Deno.upgradeWebSocket()`.
- ESLint test globals updated: added `Headers`, `ReadableStream`, `Request`, `Response`, `WebSocket`, `queueMicrotask`. Removed redundant `/* global */` comments from `BunHttpAdapter.test.js` and `DenoHttpAdapter.test.js`.

---

### T11 — Serve Static Build ✅ DONE

**Status:** DONE

**What was built:**
- `src/infrastructure/adapters/staticFileHandler.js` — shared static file handler with MIME type mapping, SPA fallback (extensionless paths serve `index.html`), path traversal containment (resolve-based), and null byte rejection.
- `NodeWsAdapter` — when `staticDir` is set, creates an `http.Server` with the static handler and mounts `ws.WebSocketServer` on top of it. HTTP and WS share the same port.
- `BunWsAdapter` — extracted `createFetchHandler()` that attempts WS upgrade, then falls back to static file serving when `staticDir` is set.
- `DenoWsAdapter` — same pattern: WS upgrade first, static fallback for HTTP requests.
- `bin/cli/commands/serve.js` — new `--static <dir>` flag. Validates directory exists. Passes `staticDir` to `createWsAdapter()`. Prints HTTP URL when static serving is active.
- `bin/cli/schemas.js` — added `static` to `serveSchema`.
- `bin/cli/infrastructure.js` — documented `--static` in `HELP_TEXT`.
- `test/unit/infrastructure/adapters/staticFileHandler.test.js` — 14 tests (MIME types, SPA fallback, traversal, null bytes).
- `test/unit/infrastructure/adapters/NodeWsAdapter.test.js` — 4 new integration tests (HTTP static serving + WS on same port).

**Key design decisions:**
- Static serving lives in the adapters, not the port interface — `WebSocketServerPort` stays WS-only, no ISP violation.
- Path traversal: `resolve(root, '.' + normalize('/' + path))` guarantees the resolved path stays inside root. Null bytes are rejected explicitly.
- SPA fallback: extensionless paths that don't match a file serve `index.html`. Paths with a file extension that don't match a file get 404.

---

## Recovery Notes

If resuming from a different context:

1. **Branch:** `feat/browsa-serve` off `main`
2. **Commits so far:** Inspector rename (`ec3cf04`), port + service (`e64b979`)
3. **Test command:** `npx vitest run test/unit/domain/services/WarpServeService.test.js`
4. **Lint command:** `npx eslint src/domain/services/WarpServeService.js`
5. **Key files:**
   - Port: `src/ports/WebSocketServerPort.js`
   - Service: `src/domain/services/WarpServeService.js`
   - Service tests: `test/unit/domain/services/WarpServeService.test.js`
6. **Principles:** Hexagonal architecture, SOLID, DRY, KISS, TDD (tests first), tests validate behavior not implementation
7. **Multi-writer is conflict-free:** Each writer has its own ref. Browser gets its own `writerId`. No coordination needed with CLI writers.
8. **The `serve` command is long-running:** Must not trigger `process.exit()` in the entrypoint.
9. **ESLint rules to watch:** `no-floating-promises` (await or `.catch()` all promises), `no-void`, `curly` (always use braces), `no-console` in src files.
10. **Read CLAUDE.md** for full project conventions before making changes.
