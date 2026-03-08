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

### T2 — Node WebSocket Adapter

**Status:** PENDING

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

### T3 — CLI Command: `git warp serve`

**Status:** PENDING

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

### T4 — Browser Client: WarpSocket

**Status:** PENDING

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

### T5 — Rewire graphStore.js

**Status:** PENDING

**Goal:** Replace the in-memory `WarpGraph` usage in `graphStore.js` with `WarpSocket` calls.

**Files to modify:**
- `demo/browsa/src/stores/graphStore.js` — complete rewrite
- `demo/browsa/src/App.vue` — minor: remove hardcoded 4-viewport grid, add connection UI
- `demo/browsa/src/main.js` — pass server URL from query param or config

**What changes:**
- Remove: `InMemoryGraphAdapter`, `WebCryptoAdapter`, `generateWriterId`, `sha1sync`, `InsecureCryptoAdapter`, `InProcessSyncBus` imports
- Remove: `sharedPersistence`, `sharedCrypto`, `syncBus`, all direct `WarpGraph.open()` calls
- Add: `WarpSocket` import, connection lifecycle, reconnect handling
- `init()`: connect to `ws://localhost:PORT`, wait for `hello`, populate graph list
- `openGraph(name)`: send `open` message, receive state, populate viewport
- `addNode/removeNode/addEdge`: send `mutate` message, wait for `ack`
- `setCeiling`: send `seek` message, receive state
- `selectNode → inspect`: send `inspect` message, receive props
- `onDiff` callback: update viewport state incrementally
- Sync buttons: remove entirely (sync is automatic via the shared repo — other writers' patches are picked up by `graph.watch()` on the server)
- Online/offline toggle: remove (doesn't make sense when connected to a real repo)

**Single viewport:**
- Default to one viewport showing the selected graph
- Multiple browser windows = multiple writers (each gets its own `writerId`)
- Graph selector dropdown: populated from `hello.graphs`

**Dependency:** T4 (needs `WarpSocket`)

---

### T6 — Rewire Inspector

**Status:** PENDING (component renamed from DaCone in `ec3cf04`)

**Goal:** Inspector shows real materialized properties and provenance from the server, not hardcoded viewport state.

**Files to modify:**
- `demo/browsa/src/components/Inspector.vue`

**What changes:**
- On node selection, send `inspect` message via `WarpSocket`
- Display all returned properties (not just id/color/label)
- Show system properties (prefixed with `_`) in a separate section
- Show edge connections (from state, not inspect — already available from `state`/`diff` messages)
- Future: show provenance (writer ID, Lamport timestamp, version vector position) — may need a `provenance` protocol message (defer to T9 or later)

**Dependency:** T5 (needs rewired graphStore)

---

### T7 — Simplify Vite Config and Clean Up

**Status:** PENDING

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

### T8 — Connection Status UI

**Status:** PENDING

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

### T9 — Polish and Ship

**Status:** PENDING

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

### T10 — Deferred: Bun + Deno WebSocket Adapters

**Status:** DEFERRED

**Goal:** Implement `WebSocketServerPort` for Bun and Deno so `git warp serve` works on all runtimes.

**Bun adapter:**
- `Bun.serve({ websocket: { open, message, close } })` — native WS support
- File: `src/infrastructure/adapters/BunWsAdapter.js`

**Deno adapter:**
- `Deno.serve()` + `Deno.upgradeWebSocket(req)` — native WS support
- File: `src/infrastructure/adapters/DenoWsAdapter.js`

**Runtime detection:**
- `serve` CLI command detects runtime (`globalThis.Bun`, `globalThis.Deno`, or Node) and picks the appropriate adapter
- Or: use dynamic import with try/catch

---

### T11 — Deferred: Serve Static Build

**Status:** DEFERRED

**Goal:** Have `git warp serve` also serve the built browsa SPA, so users don't need a separate Vite dev server.

**Approach:**
- Build browsa to `demo/browsa/dist/` (already works via `npm run build`)
- `git warp serve` serves static files from that directory over HTTP on the same port
- WebSocket upgrade on the same port (ws and http share the server)
- This means `git warp serve` is a single command — no second terminal needed

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
