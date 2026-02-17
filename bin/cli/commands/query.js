import { renderGraphView } from '../../../src/visualization/renderers/ascii/graph.js';
import { renderSvg } from '../../../src/visualization/renderers/svg/index.js';
import { layoutGraph, queryResultToGraphData } from '../../../src/visualization/layouts/index.js';
import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.js';
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
      const label = next && !next.startsWith('-') ? next : undefined;
      steps.push({ type: arg.slice(2), label });
      if (label) {
        i += 1;
      }
    } else {
      remaining.push(arg);
    }
  }

  return { steps, remaining };
}

/** @param {string} value */
function parseWhereProp(value) {
  const [key, ...rest] = value.split('=');
  if (!key || rest.length === 0) {
    throw usageError('Expected --where-prop key=value');
  }
  return { type: 'where-prop', key, value: rest.join('=') };
}

/** @param {string} value */
function parseSelectFields(value) {
  if (value === '') {
    return [];
  }
  return value.split(',').map((field) => field.trim()).filter(Boolean);
}

/** @param {string[]} args */
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
 * @param {QueryBuilderLike} builder
 * @param {Array<{type: string, label?: string, key?: string, value?: string}>} steps
 */
function applyQuerySteps(builder, steps) {
  let current = builder;
  for (const step of steps) {
    current = applyQueryStep(current, step);
  }
  return current;
}

/**
 * @param {QueryBuilderLike} builder
 * @param {{type: string, label?: string, key?: string, value?: string}} step
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
 * @param {{props?: Record<string, unknown>}} node
 * @param {string} key
 * @param {string} value
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
      fromEntry.outgoing.push({ label: edge.label || '', to: edge.to });
    }
    if (toEntry) {
      toEntry.incoming.push({ label: edge.label || '', from: edge.from });
    }
  }
  return edgeMap;
}

/**
 * @param {string} graphName
 * @param {{nodes: Array<{id: string, props?: Record<string, unknown>}>, stateHash?: string}} result
 * @param {Array<{from: string, to: string, label?: string}>} edges
 * @returns {{graph: string, stateHash: string|undefined, nodes: Array<{id: string, props?: Record<string, unknown>} & Record<string, unknown>>, [k: string]: unknown}}
 */
function buildQueryPayload(graphName, result, edges) {
  const edgeMap = buildEdgeMap(edges);

  const nodes = result.nodes.map((/** @type {{id: string, props?: Record<string, unknown>}} */ node) => {
    /** @type {{id: string, props?: Record<string, unknown>} & Record<string, unknown>} */
    const entry = { ...node };
    const nodeEdges = edgeMap.get(node.id);
    if (nodeEdges) {
      entry.edges = nodeEdges;
    }
    return entry;
  });

  return {
    graph: graphName,
    stateHash: result.stateHash,
    nodes,
  };
}

/** @param {unknown} error */
function mapQueryError(error) {
  if (error instanceof Error && /** @type {{code?: string}} */ (error).code?.startsWith('E_QUERY')) {
    throw usageError(error.message);
  }
  throw error;
}

/**
 * Handles the `query` command: runs a logical graph query.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
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

    if (options.view) {
      const graphData = queryResultToGraphData(payload, edges);
      const positioned = await layoutGraph(graphData, { type: 'query' });
      if (typeof options.view === 'string' && (options.view.startsWith('svg:') || options.view.startsWith('html:'))) {
        payload._renderedSvg = renderSvg(positioned, { title: `${graphName} query` });
      } else {
        payload._renderedAscii = renderGraphView(positioned, { title: `QUERY: ${graphName}` });
      }
    }

    return {
      payload,
      exitCode: EXIT_CODES.OK,
    };
  } catch (error) {
    throw mapQueryError(error);
  }
}
