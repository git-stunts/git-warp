/**
 * WarpServeService — domain service that bridges WarpGraph instances
 * to browser clients over a WebSocketServerPort.
 *
 * Responsibilities:
 * - Accepts WebSocket connections and manages client lifecycle
 * - Sends materialized state on `open` requests
 * - Forwards graph diffs to subscribed clients in real-time
 * - Applies mutations (addNode, removeNode, addEdge, etc.) from clients
 * - Supports time-travel (seek) and node inspection
 *
 * @module domain/services/WarpServeService
 */

import { orsetElements } from '../crdt/ORSet.js';
import { lwwValue } from '../crdt/LWW.js';
import { decodePropKey, isEdgePropKey, decodeEdgeKey } from './KeyCodec.js';

const PROTOCOL_VERSION = 1;

/**
 * Allowlist of PatchBuilderV2 methods that WebSocket clients may invoke.
 * Prevents arbitrary method calls via untrusted `op` strings.
 * @type {Set<string>}
 */
const ALLOWED_MUTATE_OPS = new Set([
  'addNode',
  'removeNode',
  'addEdge',
  'removeEdge',
  'setProperty',
  'setEdgeProperty',
  'attachContent',
  'attachEdgeContent',
]);

/**
 * Expected argument signatures for each mutation op.
 * Each entry specifies the count and types of required arguments.
 * @type {Record<string, string[]>}
 */
const MUTATE_OP_SIGNATURES = {
  addNode: ['string'],
  removeNode: ['string'],
  addEdge: ['string', 'string', 'string'],
  removeEdge: ['string', 'string', 'string'],
  setProperty: ['string', 'string', '*'],
  setEdgeProperty: ['string', 'string', 'string', 'string', '*'],
  // Binary content (Uint8Array) cannot survive JSON serialisation — these
  // require string input over the WebSocket JSON protocol.  A future binary
  // protocol could lift this limitation.
  attachContent: ['string', 'string'],
  attachEdgeContent: ['string', 'string', 'string', 'string'],
};

/** Maximum serialized size for wildcard property values (64 KiB). */
const MAX_WILDCARD_SIZE = 65_536;

/**
 * Validates a single wildcard-typed argument against size limits.
 *
 * @param {string} op
 * @param {number} i
 * @param {unknown} arg
 * @returns {string|null}
 */
function validateWildcardArg(op, i, arg) {
  if (typeof arg === 'string' && arg.length > MAX_WILDCARD_SIZE) {
    return `${op}: arg[${i}] exceeds 64 KiB string limit`;
  }
  if (typeof arg === 'object' && arg !== null && JSON.stringify(arg).length > MAX_WILDCARD_SIZE) {
    return `${op}: arg[${i}] exceeds 64 KiB serialized limit`;
  }
  return null;
}

/**
 * Validates that args match the expected signature for an op.
 *
 * @param {string} op
 * @param {unknown[]} args
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateMutateArgs(op, args) {
  const sig = MUTATE_OP_SIGNATURES[op];
  if (!sig) {
    return `Unknown op: ${op}`;
  }
  if (!Array.isArray(args)) {
    return `${op}: args must be an array`;
  }
  if (args.length !== sig.length) {
    return `${op}: expected ${sig.length} args, got ${args.length}`;
  }
  for (let i = 0; i < sig.length; i++) {
    if (sig[i] === '*') {
      const err = validateWildcardArg(op, i, args[i]);
      if (err) { return err; }
    } else if (typeof args[i] !== sig[i]) {
      return `${op}: arg[${i}] must be ${sig[i]}, got ${typeof args[i]}`;
    }
  }
  return null;
}

/**
 * @typedef {import('../../ports/WebSocketServerPort.js').WsConnection} WsConnection
 * @typedef {import('../../ports/WebSocketServerPort.js').WsServerHandle} WsServerHandle
 */

/**
 * @typedef {Object} ClientSession
 * @property {WsConnection} conn
 * @property {Set<string>} openGraphs - Graph names this client has opened
 */

/**
 * Shape of a graph instance provided to WarpServeService.
 * @typedef {Object} GraphHandle
 * @property {string} graphName
 * @property {(opts?: { ceiling?: number }) => Promise<import('./JoinReducer.js').WarpStateV5>} materialize
 * @property {(opts: { onChange: (diff: unknown) => void }) => { unsubscribe: () => void }} subscribe
 * @property {(nodeId: string) => Promise<Record<string, unknown>>} getNodeProps
 * @property {() => Promise<{ addNode: (id: string) => Promise<void>, removeNode: (id: string) => Promise<void>, addEdge: (from: string, to: string, label: string) => Promise<void>, removeEdge: (from: string, to: string, label: string) => Promise<void>, setProperty: (nodeId: string, key: string, value: unknown) => Promise<void>, setEdgeProperty: (from: string, to: string, label: string, key: string, value: unknown) => Promise<void>, attachContent: (nodeId: string, content: string) => Promise<void>, attachEdgeContent: (from: string, to: string, label: string, content: string) => Promise<void>, commit: () => Promise<string>, [key: string]: (...args: unknown[]) => Promise<unknown> }>} createPatch
 * @property {(opts?: unknown) => Promise<unknown>} query
 */

/**
 * Envelope shape for all protocol messages.
 * @typedef {Object} Envelope
 * @property {number} v - Protocol version
 * @property {string} type - Message type
 * @property {string} [id] - Request correlation ID
 * @property {unknown} payload - Message-specific data
 */

/**
 * Serializes materialized state into a plain object suitable for JSON.
 *
 * @param {string} graphName
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {{ graph: string, nodes: Array<{ id: string, props: Record<string, unknown> }>, edges: Array<{ from: string, to: string, label: string }>, frontier: Record<string, number> }}
 */
function serializeState(graphName, state) {
  // Build node-to-props index to avoid O(nodes × props) scan
  /** @type {Map<string, Record<string, unknown>>} */
  const nodePropsMap = new Map();
  for (const [key, reg] of state.prop) {
    // Edge properties are intentionally omitted in the MVP wire format.
    // Edges are serialized as {from, to, label} only. A future protocol
    // version should include edge props alongside node props.
    // TODO: serialize edge properties when protocol supports them
    if (isEdgePropKey(key)) { continue; }
    const decoded = decodePropKey(key);
    let props = nodePropsMap.get(decoded.nodeId);
    if (!props) {
      props = {};
      nodePropsMap.set(decoded.nodeId, props);
    }
    props[decoded.propKey] = lwwValue(reg);
  }

  const nodes = [];
  for (const nodeId of orsetElements(state.nodeAlive)) {
    nodes.push({ id: nodeId, props: nodePropsMap.get(nodeId) || {} });
  }

  const edges = [];
  for (const edgeKey of orsetElements(state.edgeAlive)) {
    const decoded = decodeEdgeKey(edgeKey);
    edges.push({ from: decoded.from, to: decoded.to, label: decoded.label });
  }

  /** @type {Record<string, number>} */
  const frontier = {};
  if (state.observedFrontier) {
    for (const [writer, ts] of state.observedFrontier) {
      frontier[writer] = ts;
    }
  }

  return { graph: graphName, nodes, edges, frontier };
}

/**
 * Builds a protocol envelope.
 *
 * @param {string} type
 * @param {unknown} payload
 * @param {string} [id]
 * @returns {string}
 */
function envelope(type, payload, id) {
  /** @type {Envelope} */
  const msg = { v: PROTOCOL_VERSION, type, payload };
  if (id !== undefined) { msg.id = id; }
  return JSON.stringify(msg);
}

/**
 * Builds an error envelope.
 *
 * @param {string} code
 * @param {string} message
 * @param {string} [id]
 * @returns {string}
 */
function errorEnvelope(code, message, id) {
  return envelope('error', { code, message }, id);
}

/**
 * Validates payload graph name and resolves the graph object.
 * Sends an error envelope and returns null on failure.
 *
 * @param {ClientSession} session
 * @param {Envelope} msg
 * @param {{ graphs: Map<string, GraphHandle>, requireOpen?: boolean }} opts
 * @returns {{ graphName: string, graph: GraphHandle }|null}
 */
function resolveGraph(session, msg, { graphs, requireOpen = true }) {
  const { payload } = msg;
  const graphName = /** @type {Record<string, unknown>} */ (payload)?.graph;

  if (typeof graphName !== 'string' || graphName.length === 0) {
    session.conn.send(errorEnvelope('E_INVALID_PAYLOAD', `${msg.type}: graph must be a non-empty string`, msg.id));
    return null;
  }
  if (requireOpen && !session.openGraphs.has(graphName)) {
    session.conn.send(errorEnvelope('E_NOT_OPENED', `Graph not opened: ${graphName}`, msg.id));
    return null;
  }
  const graph = graphs.get(graphName);
  if (!graph) {
    session.conn.send(errorEnvelope('E_UNKNOWN_GRAPH', `Unknown graph: ${graphName}`, msg.id));
    return null;
  }
  return { graphName, graph };
}

export default class WarpServeService {
  /**
   * @param {{ wsPort: import('../../ports/WebSocketServerPort.js').default, graphs: GraphHandle[] }} options
   */
  constructor({ wsPort, graphs }) {
    if (!wsPort || typeof wsPort.createServer !== 'function') {
      throw new Error('wsPort must be a WebSocketServerPort');
    }
    if (!Array.isArray(graphs) || graphs.length === 0) {
      throw new Error('At least one graph is required');
    }

    /** @type {import('../../ports/WebSocketServerPort.js').default} */
    this._wsPort = wsPort;

    /** @type {Map<string, GraphHandle>} */
    this._graphs = new Map();
    for (const g of graphs) {
      this._graphs.set(g.graphName, g);
    }

    /** @type {Set<ClientSession>} */
    this._clients = new Set();

    /** @type {Map<string, { unsubscribe: () => void }>} */
    this._subscriptions = new Map();

    /** @type {WsServerHandle|null} */
    this._server = null;
  }

  /**
   * Start listening for WebSocket connections.
   *
   * @param {number} port
   * @param {string} [host]
   * @returns {Promise<{ port: number, host: string }>}
   */
  async listen(port, host) {
    if (this._server) {
      throw new Error('Server is already listening');
    }

    const server = this._wsPort.createServer((conn) => this._onConnection(conn));

    // Subscribe to each graph for live diff push.
    // Subscriptions are created before bind so diffs aren't missed between
    // bind and subscribe — but we must clean up if bind fails.
    /** @type {Map<string, { unsubscribe: () => void }>} */
    const subs = new Map();
    for (const [graphName, graph] of this._graphs) {
      const sub = graph.subscribe({
        onChange: (/** @type {unknown} */ diff) => this._broadcastDiff(graphName, diff),
      });
      subs.set(graphName, sub);
    }

    try {
      const result = await server.listen(port, host);
      // Bind succeeded — commit state mutations
      this._server = server;
      this._subscriptions = subs;
      return result;
    } catch (err) {
      // Bind failed — clean up subscriptions to prevent leaked broadcast handlers
      for (const [, sub] of subs) {
        sub.unsubscribe();
      }
      throw err;
    }
  }

  /**
   * Shut down the server and clean up subscriptions.
   *
   * @returns {Promise<void>}
   */
  async close() {
    for (const [, sub] of this._subscriptions) {
      sub.unsubscribe();
    }
    this._subscriptions.clear();

    for (const client of this._clients) {
      try {
        client.conn.close();
      } catch {
        // Best-effort — connection may already be dead.
      }
    }
    this._clients.clear();

    if (this._server) {
      await this._server.close();
      this._server = null;
    }
  }

  /**
   * Handle a new WebSocket connection.
   *
   * @param {WsConnection} conn
   * @private
   */
  _onConnection(conn) {
    /** @type {ClientSession} */
    const session = {
      conn,
      openGraphs: new Set(),
    };
    this._clients.add(session);

    // Send hello
    conn.send(envelope('hello', {
      protocol: PROTOCOL_VERSION,
      graphs: [...this._graphs.keys()],
    }));

    conn.onMessage((raw) => {
      // Extract correlation ID before the async call so the catch handler
      // can correlate the error without re-parsing the raw message.
      let id;
      try { id = JSON.parse(raw).id; } catch { /* unparseable — no id */ }

      this._onMessage(session, raw).catch(() => {
        // Errors are caught and sent as error envelopes inside _onMessage handlers.
        // This catch prevents unhandled rejection for truly unexpected failures.
        // Send a generic message to avoid leaking internal details (file paths,
        // stack traces, etc.) to untrusted WebSocket clients.
        session.conn.send(errorEnvelope(
          'E_INTERNAL',
          'Internal error',
          id,
        ));
      });
    });
    conn.onClose(() => this._clients.delete(session));
  }

  /**
   * Handle an incoming message from a client.
   *
   * @param {ClientSession} session
   * @param {string} raw
   * @private
   */
  async _onMessage(session, raw) {
    if (raw.length > 1_048_576) {
      session.conn.send(errorEnvelope('E_MESSAGE_TOO_LARGE', 'Message exceeds 1 MiB limit'));
      return;
    }

    /** @type {Envelope} */
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      session.conn.send(errorEnvelope('E_INVALID_MESSAGE', 'Invalid JSON'));
      return;
    }

    if (!msg || typeof msg.type !== 'string') {
      session.conn.send(errorEnvelope('E_INVALID_MESSAGE', 'Missing type field'));
      return;
    }

    if (msg.v !== PROTOCOL_VERSION) {
      session.conn.send(errorEnvelope(
        'E_UNSUPPORTED_VERSION',
        `Unsupported protocol version: ${msg.v}. Expected: ${PROTOCOL_VERSION}`,
        msg.id,
      ));
      return;
    }

    switch (msg.type) {
      case 'open':
        await this._handleOpen(session, msg);
        break;
      case 'mutate':
        await this._handleMutate(session, msg);
        break;
      case 'inspect':
        await this._handleInspect(session, msg);
        break;
      case 'seek':
        await this._handleSeek(session, msg);
        break;
      default:
        session.conn.send(errorEnvelope(
          'E_UNKNOWN_TYPE',
          `Unknown message type: ${msg.type}`,
          msg.id,
        ));
    }
  }

  /**
   * Handle 'open' — client subscribes to a graph.
   *
   * `materialize()` is called without `receipts: true`, so the return is
   * always a plain `WarpStateV5` (not a `MaterializeResult` with receipts).
   *
   * @param {ClientSession} session
   * @param {Envelope} msg
   * @private
   */
  async _handleOpen(session, msg) {
    const resolved = resolveGraph(session, msg, { graphs: this._graphs, requireOpen: false });
    if (!resolved) { return; }
    const { graphName, graph } = resolved;

    let state;
    try {
      state = await graph.materialize();
    } catch (err) {
      session.conn.send(errorEnvelope(
        'E_MATERIALIZE_FAILED',
        err instanceof Error ? err.message : 'Materialization failed',
        msg.id,
      ));
      return;
    }

    session.openGraphs.add(graphName);
    const serialized = serializeState(graphName, state);
    session.conn.send(envelope('state', serialized, msg.id));
  }

  /**
   * Handle 'mutate' — client sends graph mutations.
   *
   * @param {ClientSession} session
   * @param {Envelope} msg
   * @private
   */
  async _handleMutate(session, msg) {
    const { payload } = msg;
    const ops = /** @type {Array<{ op: string, args: unknown[] }>|undefined} */ (
      /** @type {Record<string, unknown>} */ (payload)?.ops
    );

    if (!Array.isArray(ops)) {
      session.conn.send(errorEnvelope('E_INVALID_PAYLOAD', 'mutate: ops must be an array', msg.id));
      return;
    }

    const resolved = resolveGraph(session, msg, { graphs: this._graphs });
    if (!resolved) { return; }

    await this._applyMutateOps(session, msg, { graph: resolved.graph, ops });
  }

  /**
   * Validate and apply mutation ops for _handleMutate.
   *
   * @param {ClientSession} session
   * @param {Envelope} msg
   * @param {{ graph: GraphHandle, ops: Array<{ op: string, args: unknown[] }> }} ctx
   * @private
   */
  async _applyMutateOps(session, msg, { graph, ops }) {
    // Pre-validate ALL ops before creating a patch
    for (const { op, args } of ops) {
      if (!ALLOWED_MUTATE_OPS.has(op)) {
        session.conn.send(errorEnvelope('E_INVALID_OP', `Unknown mutation op: ${op}`, msg.id));
        return;
      }
      const argError = validateMutateArgs(op, args);
      if (argError) {
        session.conn.send(errorEnvelope('E_INVALID_ARGS', argError, msg.id));
        return;
      }
    }

    try {
      const patch = await graph.createPatch();
      for (const { op, args } of ops) {
        await patch[op](...args);
      }
      const sha = await patch.commit();
      session.conn.send(envelope('ack', { sha }, msg.id));
    } catch (err) {
      session.conn.send(errorEnvelope(
        'E_MUTATE_FAILED',
        err instanceof Error ? err.message : 'Mutation failed',
        msg.id,
      ));
    }
  }

  /**
   * Handle 'inspect' — client requests node properties.
   *
   * @param {ClientSession} session
   * @param {Envelope} msg
   * @private
   */
  async _handleInspect(session, msg) {
    const { payload } = msg;
    const nodeId = /** @type {string} */ (/** @type {Record<string, unknown>} */ (payload)?.nodeId);

    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      session.conn.send(errorEnvelope('E_INVALID_PAYLOAD', 'inspect: nodeId must be a non-empty string', msg.id));
      return;
    }

    const resolved = resolveGraph(session, msg, { graphs: this._graphs });
    if (!resolved) { return; }
    const { graphName, graph } = resolved;

    try {
      const props = await graph.getNodeProps(nodeId);
      session.conn.send(envelope('inspect', { graph: graphName, nodeId, props }, msg.id));
    } catch (err) {
      session.conn.send(errorEnvelope(
        'E_INSPECT_FAILED',
        err instanceof Error ? err.message : 'Inspect failed',
        msg.id,
      ));
    }
  }

  /**
   * Validates a seek ceiling value. Returns an error message or null.
   * Infinity is intentionally accepted (treated as "materialize at head").
   *
   * @param {unknown} ceiling
   * @returns {string|null}
   * @private
   */
  _validateCeiling(ceiling) {
    if (typeof ceiling !== 'number' || ceiling < 0 || Number.isNaN(ceiling)) {
      return 'seek: ceiling must be a non-negative number';
    }
    if (Number.isFinite(ceiling) && !Number.isInteger(ceiling)) {
      return 'seek: ceiling must be an integer';
    }
    return null;
  }

  /**
   * Handle 'seek' — client requests time-travel materialization.
   *
   * @param {ClientSession} session
   * @param {Envelope} msg
   * @private
   */
  async _handleSeek(session, msg) {
    const { payload } = msg;
    const ceiling = /** @type {number} */ (/** @type {Record<string, unknown>} */ (payload)?.ceiling);

    const ceilingError = this._validateCeiling(ceiling);
    if (ceilingError) {
      session.conn.send(errorEnvelope('E_INVALID_PAYLOAD', ceilingError, msg.id));
      return;
    }

    const resolved = resolveGraph(session, msg, { graphs: this._graphs });
    if (!resolved) { return; }
    const { graphName, graph } = resolved;

    try {
      const opts = Number.isFinite(ceiling) ? { ceiling } : {};
      const state = await graph.materialize(opts);
      const serialized = serializeState(graphName, state);
      session.conn.send(envelope('state', serialized, msg.id));
    } catch (err) {
      session.conn.send(errorEnvelope(
        'E_SEEK_FAILED',
        err instanceof Error ? err.message : 'Seek failed',
        msg.id,
      ));
    }
  }

  /**
   * Broadcast a diff to all clients subscribed to the given graph.
   *
   * @param {string} graphName
   * @param {unknown} diff
   * @private
   */
  _broadcastDiff(graphName, diff) {
    const msg = envelope('diff', { graph: graphName, diff });
    /** @type {ClientSession[]} */
    const dead = [];
    for (const client of this._clients) {
      if (client.openGraphs.has(graphName)) {
        try {
          client.conn.send(msg);
        } catch {
          // Dead connection — evict after iteration.  No logger is
          // available at this layer; the `onClose` handler also evicts,
          // but `send()` can throw before `close` fires on a reset
          // connection.  We must not delete from the Set mid-iteration.
          dead.push(client);
        }
      }
    }
    for (const client of dead) {
      this._clients.delete(client);
    }
  }
}
