import { renderSvg } from '../../../src/visualization/renderers/svg/index.js';
import { layoutGraph, pathResultToGraphData } from '../../../src/visualization/layouts/index.js';
import { EXIT_CODES, usageError, notFoundError, readOptionValue } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/** @param {string[]} args */
function parsePathArgs(args) {
  const options = createPathOptions();
  /** @type {string[]} */
  const labels = [];
  /** @type {string[]} */
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const result = consumePathArg({ args, index: i, options, labels, positionals });
    i += result.consumed;
  }

  finalizePathOptions(options, labels, positionals);
  return options;
}

/** @returns {{from: string|null, to: string|null, dir: string|undefined, labelFilter: string|string[]|undefined, maxDepth: number|undefined}} */
function createPathOptions() {
  return {
    from: null,
    to: null,
    dir: undefined,
    labelFilter: undefined,
    maxDepth: undefined,
  };
}

/**
 * @param {{args: string[], index: number, options: ReturnType<typeof createPathOptions>, labels: string[], positionals: string[]}} params
 */
function consumePathArg({ args, index, options, labels, positionals }) {
  const arg = args[index];
  /** @type {Array<{flag: string, apply: (value: string) => void}>} */
  const handlers = [
    { flag: '--from', apply: (value) => { options.from = value; } },
    { flag: '--to', apply: (value) => { options.to = value; } },
    { flag: '--dir', apply: (value) => { options.dir = value; } },
    { flag: '--label', apply: (value) => { labels.push(...parseLabels(value)); } },
    { flag: '--max-depth', apply: (value) => { options.maxDepth = parseMaxDepth(value); } },
  ];

  for (const handler of handlers) {
    const result = readOptionValue({ args, index, flag: handler.flag });
    if (result) {
      handler.apply(result.value);
      return result;
    }
  }

  if (arg.startsWith('-')) {
    throw usageError(`Unknown path option: ${arg}`);
  }

  positionals.push(arg);
  return { consumed: 0 };
}

/**
 * @param {ReturnType<typeof createPathOptions>} options
 * @param {string[]} labels
 * @param {string[]} positionals
 */
function finalizePathOptions(options, labels, positionals) {
  if (!options.from) {
    options.from = positionals[0] || null;
  }

  if (!options.to) {
    options.to = positionals[1] || null;
  }

  if (!options.from || !options.to) {
    throw usageError('Path requires --from and --to (or two positional ids)');
  }

  if (labels.length === 1) {
    options.labelFilter = labels[0];
  } else if (labels.length > 1) {
    options.labelFilter = labels;
  }
}

/** @param {string} value */
function parseLabels(value) {
  return value.split(',').map((label) => label.trim()).filter(Boolean);
}

/** @param {string} value */
function parseMaxDepth(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw usageError('Invalid value for --max-depth');
  }
  return parsed;
}

/**
 * Handles the `path` command: finds a shortest path between two nodes.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handlePath({ options, args }) {
  const pathOptions = parsePathArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  try {
    const result = await graph.traverse.shortestPath(
      pathOptions.from,
      pathOptions.to,
      {
        dir: pathOptions.dir,
        labelFilter: pathOptions.labelFilter,
        maxDepth: pathOptions.maxDepth,
      }
    );

    const payload = {
      graph: graphName,
      from: pathOptions.from,
      to: pathOptions.to,
      ...result,
    };

    if (options.view && result.found && typeof options.view === 'string' && (options.view.startsWith('svg:') || options.view.startsWith('html:'))) {
      const graphData = pathResultToGraphData(payload);
      const positioned = await layoutGraph(graphData, { type: 'path' });
      payload._renderedSvg = renderSvg(positioned, { title: `${graphName} path` });
    }

    return {
      payload,
      exitCode: result.found ? EXIT_CODES.OK : EXIT_CODES.NOT_FOUND,
    };
  } catch (/** @type {*} */ error) { // TODO(ts-cleanup): type error
    if (error && error.code === 'NODE_NOT_FOUND') {
      throw notFoundError(error.message);
    }
    throw error;
  }
}
