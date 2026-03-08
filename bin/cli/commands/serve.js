import process from 'node:process';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { parseCommandArgs, usageError, notFoundError } from '../infrastructure.js';
import { serveSchema } from '../schemas.js';
import { createPersistence, listGraphNames } from '../shared.js';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.js';
import WarpServeService from '../../../src/domain/services/WarpServeService.js';

/**
 * Creates the appropriate WebSocket adapter for the current runtime.
 *
 * @param {string|null} [staticDir]
 * @returns {Promise<import('../../../src/ports/WebSocketServerPort.js').default>}
 */
async function createWsAdapter(staticDir) {
  const opts = staticDir ? { staticDir } : {};
  if (globalThis.Bun) {
    const { default: BunWsAdapter } = await import(
      '../../../src/infrastructure/adapters/BunWsAdapter.js'
    );
    return new BunWsAdapter(opts);
  }
  if (globalThis.Deno) {
    const { default: DenoWsAdapter } = await import(
      '../../../src/infrastructure/adapters/DenoWsAdapter.js'
    );
    return new DenoWsAdapter(opts);
  }
  const { default: NodeWsAdapter } = await import(
    '../../../src/infrastructure/adapters/NodeWsAdapter.js'
  );
  return new NodeWsAdapter(opts);
}

/**
 * Returns true when the host string resolves to the loopback interface.
 *
 * @param {string} h
 * @returns {boolean}
 */
function isLoopback(h) {
  return h === '127.0.0.1' || h === '::1' || h === 'localhost';
}

/** @typedef {import('../types.js').CliOptions} CliOptions */

const SERVE_OPTIONS = {
  port: { type: 'string', default: '3000' },
  host: { type: 'string', default: '127.0.0.1' },
  static: { type: 'string' },
  expose: { type: 'boolean', default: false },
  'writer-id': { type: 'string' },
};

/**
 * Opens WarpGraph instances for the specified graph names.
 *
 * @param {import('../types.js').Persistence} persistence
 * @param {string[]} graphNames
 * @param {string} writerId
 * @returns {Promise<Array<import('../../../src/domain/WarpGraph.js').default>>}
 */
async function openGraphs(persistence, graphNames, writerId) {
  const graphs = [];
  for (const graphName of graphNames) {
    const graph = await WarpGraph.open({
      persistence: /** @type {import('../../../src/domain/types/WarpPersistence.js').CorePersistence} */ (/** @type {unknown} */ (persistence)),
      graphName,
      writerId,
      crypto: new WebCryptoAdapter(),
    });
    graphs.push(graph);
  }
  return graphs;
}

/**
 * Resolve and validate the `--static` directory, if provided.
 *
 * @param {string|undefined} raw
 * @returns {Promise<string|null>}
 */
async function resolveStaticDir(raw) {
  if (!raw) {
    return null;
  }
  const dir = resolve(raw);
  const st = await stat(dir).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw usageError(`--static path is not a directory: ${raw}`);
  }
  return dir;
}

/**
 * Determine which graphs to serve and validate the selection.
 *
 * @param {import('../types.js').Persistence} persistence
 * @param {string|null} [graphOption]
 * @returns {Promise<{ persistence: import('../types.js').Persistence, targetGraphs: string[] }>}
 */
async function resolveTargetGraphs(persistence, graphOption) {
  const graphNames = await listGraphNames(persistence);
  if (graphNames.length === 0) {
    throw usageError('No WARP graphs found in this repository');
  }
  if (graphOption && !graphNames.includes(graphOption)) {
    throw notFoundError(`Graph not found: ${graphOption}`);
  }
  const targetGraphs = graphOption ? [graphOption] : graphNames;
  return { persistence, targetGraphs };
}

/**
 * Build a unique writerId from the host and requested port.
 * When port is 0 the OS assigns an ephemeral port, so a timestamp
 * component prevents collisions across successive invocations.
 *
 * @param {string} host
 * @param {number} port
 * @returns {string}
 */
function deriveWriterId(host, port) {
  const portLabel = port === 0
    ? `ephemeral-${Date.now().toString(36)}-${process.pid}`
    : String(port);
  return `serve-${host}-${portLabel}`.replace(/[^A-Za-z0-9._-]/g, '-');
}

/**
 * Bracket an IPv6 host for use in URLs.
 *
 * @param {string} h
 * @returns {string}
 */
function bracketHost(h) {
  return h.includes(':') ? `[${h}]` : h;
}

/**
 * Guards against binding to a non-loopback address without --expose.
 *
 * @param {string} host
 * @param {boolean} expose
 */
function assertExposeSafety(host, expose) {
  if (!isLoopback(host) && !expose) {
    throw usageError(
      `Binding to non-loopback address '${host}' exposes the server to the network. ` +
      'Pass --expose to confirm this is intentional.',
    );
  }
}

/**
 * Logs startup information to stderr.
 *
 * @param {{url: string, targetGraphs: string[], staticDir: string|null, urlHost: string, port: number}} info
 */
function logStartup({ url, targetGraphs, staticDir, urlHost, port }) {
  process.stderr.write(`Listening on ${url}\n`);
  process.stderr.write(`Serving graph(s): ${targetGraphs.join(', ')}\n`);
  if (staticDir) {
    process.stderr.write(`Serving static files from ${staticDir}\n`);
    process.stderr.write(`Open http://${urlHost}:${port} in your browser\n`);
  }
}

/**
 * Handles the `serve` command: starts a WebSocket server exposing
 * graph(s) in the repository for browser-based viewing and mutation.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: {url: string, host: string, port: number, graphs: string[]}, close: () => Promise<void>}>}
 */
export default async function handleServe({ options, args }) {
  const { values } = parseCommandArgs(args, SERVE_OPTIONS, serveSchema, { allowPositionals: false });
  const { port, host, expose, writerId: explicitWriterId } = values;
  assertExposeSafety(host, expose);

  const staticDir = await resolveStaticDir(values.static);
  const { persistence } = await createPersistence(options.repo);
  const { targetGraphs } = await resolveTargetGraphs(persistence, options.graph);

  const writerId = explicitWriterId || deriveWriterId(host, port);
  const graphs = await openGraphs(persistence, targetGraphs, writerId);
  const wsPort = await createWsAdapter(staticDir);
  const service = new WarpServeService({ wsPort, graphs });
  const addr = await service.listen(port, host);

  const urlHost = bracketHost(addr.host);
  const url = `ws://${urlHost}:${addr.port}`;
  logStartup({ url, targetGraphs, staticDir, urlHost, port: addr.port });

  return {
    payload: { url, host: addr.host, port: addr.port, graphs: targetGraphs },
    // WarpServeService.close() unsubscribes all graph subscriptions and
    // shuts down the WebSocket server. WarpGraph/GitGraphAdapter hold no
    // long-lived resources beyond in-memory state, so process exit is
    // sufficient for their cleanup.
    close: () => service.close(),
  };
}
