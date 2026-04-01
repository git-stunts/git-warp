import { renderGraphView } from '../../../src/visualization/renderers/ascii/graph.js';
import { renderSvg } from '../../../src/visualization/renderers/svg/index.js';
import { layoutGraph, queryResultToGraphData } from '../../../src/visualization/layouts/index.js';
import { EXIT_CODES, CliError, usageError, parseCommandArgs } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';
import { querySchema } from '../schemas.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/** @typedef {import('../types.js').QueryBuilderLike} QueryBuilderLike */

const QUERY_OPTIONS = {
  match: { type: 'string' },
  'where-prop': { type: 'string', multiple: true },
  select: { type: 'string' },
};

/**
 * Extracts --outgoing/--incoming traversal steps from args, returning
 * remaining args for standard parseArgs processing.
 *
 * These flags have optional-value semantics: --outgoing [label].
 * The label is consumed only if the next arg is not a flag.
 *
 * @param {string[]} args
 * @returns {{steps: Array<{type: string, label?: string}>, remaining: string[]}}
 */
function extractTraversalSteps(args) {
  /** @type {Array<{type: string, label?: string}>} */
  const steps = [];
  /** @type {string[]} */
  const remaining = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--outgoing' || arg === '--incoming') {
      const next = args[i + 1];
      const label = (typeof next === 'string' && next.length > 0 && !next.startsWith('-')) ? next : undefined;
      steps.push({ type: arg.slice(2), label });
      if (typeof label === 'string' && label.length > 0) {
        i += 1;
      }
    } else {
      remaining.push(arg);
    }
  }

  return { steps, remaining };
}

/**
 * Parses a --where-prop key=value string into a filter step.
 * @param {string} value - Raw key=value string from CLI args
 */
function parseWhereProp(value) {
  const [key, ...rest] = value.split('=');
  if (typeof key !== 'string' || key.length === 0 || rest.length === 0) {
    throw usageError('Expected --where-prop key=value');
  }
  return { type: 'where-prop', key, value: rest.join('=') };
}

/**
 * Splits a comma-separated select fields string into an array of trimmed field names.
 * @param {string} value - Comma-separated field names from --select
 */
function parseSelectFields(value) {
  if (value === '') {
    return [];
  }
  return value.split(',').map((field) => field.trim()).filter(Boolean);
}

/**
 * Parses raw CLI args into a structured query specification.
 * @param {string[]} args - Raw CLI arguments after base flag extraction
 */
function parseQueryArgs(args) {
  // Extract traversal steps first (optional-value semantics)
  const { steps, remaining } = extractTraversalSteps(args);

  // Parse remaining flags with parseArgs + Zod
  const { values } = parseCommandArgs(remaining, QUERY_OPTIONS, querySchema);

  // Convert --where-prop values to steps
  const allSteps = [
    ...steps,
    ...values.whereProp.map((/** @type {string} */ wp) => parseWhereProp(wp)),
  ];

  return {
    match: values.match,
    select: values.select !== undefined ? parseSelectFields(values.select) : null,
    steps: allSteps,
  };
}

/**
 * Applies all traversal and filter steps to a query builder in sequence.
 * @param {QueryBuilderLike} builder - Initial query builder
 * @param {Array<{type: string, label?: string, key?: string, value?: string}>} steps - Traversal/filter steps
 */
function applyQuerySteps(builder, steps) {
  let current = builder;
  for (const step of steps) {
    current = applyQueryStep(current, step);
  }
  return current;
}

/**
 * Applies a single traversal or filter step to a query builder.
 * @param {QueryBuilderLike} builder - Current query builder
 * @param {{type: string, label?: string, key?: string, value?: string}} step - Step to apply
 */
function applyQueryStep(builder, step) {
  if (step.type === 'outgoing') {
    return builder.outgoing(step.label);
  }
  if (step.type === 'incoming') {
    return builder.incoming(step.label);
  }
  if (step.type === 'where-prop') {
    return builder.where((/** @type {{props?: Record<string, unknown>}} */ node) => matchesPropFilter(node, /** @type {string} */ (step.key), /** @type {string} */ (step.value)));
  }
  return builder;
}

/**
 * Tests whether a node's properties match a key-value filter.
 * @param {{props?: Record<string, unknown>}} node - Node with optional props
 * @param {string} key - Property key to check
 * @param {string} value - Expected property value (string comparison)
 */
function matchesPropFilter(node, key, value) {
  const props = node.props || {};
  if (!Object.prototype.hasOwnProperty.call(props, key)) {
    return false;
  }
  return String(props[key]) === value;
}

/**
 * Builds a map of nodeId -> {outgoing: [], incoming: []} from edges.
 * @param {Array<{from: string, to: string, label?: string}>} edges
 * @returns {Map<string, {outgoing: Array<{label: string, to: string}>, incoming: Array<{label: string, from: string}>}>}
 */
function buildEdgeMap(edges) {
  /** @type {Map<string, {outgoing: Array<{label: string, to: string}>, incoming: Array<{label: string, from: string}>}>} */
  const edgeMap = new Map();
  for (const edge of edges) {
    if (!edgeMap.has(edge.from)) {
      edgeMap.set(edge.from, { outgoing: [], incoming: [] });
    }
    if (!edgeMap.has(edge.to)) {
      edgeMap.set(edge.to, { outgoing: [], incoming: [] });
    }
    const fromEntry = edgeMap.get(edge.from);
    const toEntry = edgeMap.get(edge.to);
    if (fromEntry) {
      fromEntry.outgoing.push({ label: (typeof edge.label === 'string' && edge.label.length > 0) ? edge.label : '', to: edge.to });
    }
    if (toEntry) {
      toEntry.incoming.push({ label: (typeof edge.label === 'string' && edge.label.length > 0) ? edge.label : '', from: edge.from });
    }
  }
  return edgeMap;
}

/**
 * Assembles the JSON payload for a query result, enriching nodes with edge data.
 * @param {string} graphName - Name of the WARP graph
 * @param {{nodes: Array<{id: string, props?: Record<string, unknown>}>, stateHash?: string}} result - Query result
 * @param {Array<{from: string, to: string, label?: string}>} edges - All graph edges
 * @returns {{graph: string, stateHash: string|undefined, nodes: Array<{id: string, props?: Record<string, unknown>} & Record<string, unknown>>, [k: string]: unknown}}
 */
function buildQueryPayload(graphName, result, edges) {
  const edgeMap = buildEdgeMap(edges);

  const nodes = result.nodes.map((/** @type {{id: string, props?: Record<string, unknown>}} */ node) => {
    /** @type {{id: string, props?: Record<string, unknown>} & Record<string, unknown>} */
    const entry = { ...node };
    const nodeEdges = edgeMap.get(node.id);
    if (nodeEdges) {
      entry['edges'] = nodeEdges;
    }
    return entry;
  });

  return {
    graph: graphName,
    stateHash: result.stateHash,
    nodes,
  };
}

/**
 * Maps domain query errors to CLI usage errors, re-throwing otherwise.
 * @param {unknown} error - Caught error from query execution
 * @returns {never} Always throws
 */
function mapQueryError(error) {
  if (error instanceof Error && /** @type {{code?: string}} */ (error).code?.startsWith('E_QUERY') === true) {
    throw usageError(error.message);
  }
  if (error instanceof Error) {
    throw error;
  }
  throw new CliError(String(error));
}

/**
 * Handles the `query` command: runs a logical graph query.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleQuery({ options, args }) {
  const querySpec = parseQueryArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);
  let builder = graph.query();

  if (querySpec.match !== null) {
    builder = builder.match(querySpec.match);
  }

  builder = applyQuerySteps(builder, querySpec.steps);

  if (querySpec.select !== null) {
    builder = builder.select(querySpec.select);
  }

  try {
    const result = await builder.run();
    const edges = await graph.getEdges();
    const payload = buildQueryPayload(graphName, result, edges);

    if (options.view === true || (typeof options.view === 'string' && options.view.length > 0)) {
      const graphData = queryResultToGraphData(payload, edges);
      const positioned = await layoutGraph(graphData, { type: 'query' });
      if (typeof options.view === 'string' && options.view.length > 0 && (options.view.startsWith('svg:') || options.view.startsWith('html:'))) {
        payload['_renderedSvg'] = renderSvg(positioned, { title: `${graphName} query` });
      } else {
        payload['_renderedAscii'] = renderGraphView(positioned, { title: `QUERY: ${graphName}` });
      }
    }

    return {
      payload,
      exitCode: EXIT_CODES.OK,
    };
  } catch (error) {
    return mapQueryError(error);
  }
}
