import { renderGraphView } from '../../../src/visualization/renderers/ascii/graph.js';
import { renderSvg } from '../../../src/visualization/renderers/svg/index.js';
import { layoutGraph, queryResultToGraphData } from '../../../src/visualization/layouts/index.js';
import { EXIT_CODES, usageError, readOptionValue } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/** @param {string[]} args */
function parseQueryArgs(args) {
  const spec = {
    match: null,
    select: null,
    steps: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const result = consumeQueryArg(args, i, spec);
    if (!result) {
      throw usageError(`Unknown query option: ${args[i]}`);
    }
    i += result.consumed;
  }

  return spec;
}

/**
 * @param {string[]} args
 * @param {number} index
 * @param {{match: string|null, select: string[]|null, steps: Array<{type: string, label?: string, key?: string, value?: string}>}} spec
 */
function consumeQueryArg(args, index, spec) {
  const stepResult = readTraversalStep(args, index);
  if (stepResult) {
    spec.steps.push(stepResult.step);
    return stepResult;
  }

  const matchResult = readOptionValue({
    args,
    index,
    flag: '--match',
    allowEmpty: true,
  });
  if (matchResult) {
    spec.match = matchResult.value;
    return matchResult;
  }

  const whereResult = readOptionValue({
    args,
    index,
    flag: '--where-prop',
    allowEmpty: false,
  });
  if (whereResult) {
    spec.steps.push(parseWhereProp(whereResult.value));
    return whereResult;
  }

  const selectResult = readOptionValue({
    args,
    index,
    flag: '--select',
    allowEmpty: true,
  });
  if (selectResult) {
    spec.select = parseSelectFields(selectResult.value);
    return selectResult;
  }

  return null;
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

/**
 * @param {string[]} args
 * @param {number} index
 */
function readTraversalStep(args, index) {
  const arg = args[index];
  if (arg !== '--outgoing' && arg !== '--incoming') {
    return null;
  }
  const next = args[index + 1];
  const label = next && !next.startsWith('-') ? next : undefined;
  const consumed = label ? 1 : 0;
  return { step: { type: arg.slice(2), label }, consumed };
}

/**
 * @param {*} builder
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
 * @param {*} builder
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
    return builder.where((/** @type {*} */ node) => matchesPropFilter(node, /** @type {string} */ (step.key), /** @type {string} */ (step.value))); // TODO(ts-cleanup): type CLI payload
  }
  return builder;
}

/**
 * @param {*} node
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
 * @param {string} graphName
 * @param {*} result
 * @returns {{graph: string, stateHash: *, nodes: *, _renderedSvg?: string, _renderedAscii?: string}}
 */
function buildQueryPayload(graphName, result) {
  return {
    graph: graphName,
    stateHash: result.stateHash,
    nodes: result.nodes,
  };
}

/** @param {*} error */
function mapQueryError(error) {
  if (error && error.code && String(error.code).startsWith('E_QUERY')) {
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
    const payload = buildQueryPayload(graphName, result);

    if (options.view) {
      const edges = await graph.getEdges();
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
