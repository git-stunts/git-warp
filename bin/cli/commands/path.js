import { renderSvg } from '../../../src/visualization/renderers/svg/index.js';
import { layoutGraph, pathResultToGraphData } from '../../../src/visualization/layouts/index.js';
import { EXIT_CODES, usageError, notFoundError, parseCommandArgs } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';
import { pathSchema } from '../schemas.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/**
 * @typedef {Object} PathOptions
 * @property {string} from
 * @property {string} to
 * @property {string|undefined} dir
 * @property {string|string[]|undefined} labelFilter
 * @property {number|undefined} maxDepth
 */

/**
 * @typedef {Object} PathResult
 * @property {boolean} found
 * @property {string[]} [path]
 * @property {number} [distance]
 */

const PATH_OPTIONS = {
  from: { type: 'string' },
  to: { type: 'string' },
  dir: { type: 'string' },
  label: { type: 'string', multiple: true },
  'max-depth': { type: 'string' },
};

/**
 * Resolves from/to arguments from flags or positionals.
 * @param {{ from: string|null, to: string|null }} values - Parsed flag values.
 * @param {string[]} positionals - Positional arguments.
 * @returns {{ from: string|null, to: string|null }} Resolved from/to pair.
 */
function resolveEndpoints(values, positionals) {
  const from = values.from ?? positionals[0] ?? null;
  const to = values.to ?? positionals[1] ?? null;
  return { from, to };
}

/**
 * Derives a label filter from a flat labels array.
 * @param {string[]} labels - Expanded label strings.
 * @returns {string|string[]|undefined} A single label, array of labels, or undefined.
 */
function deriveLabelFilter(labels) {
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length > 1) {
    return labels;
  }
  return undefined;
}

/**
 * Parses CLI arguments for the path command into structured options.
 * @param {string[]} args - Raw CLI argument tokens.
 * @returns {PathOptions} Validated path options including from, to, dir, labelFilter, and maxDepth.
 */
function parsePathArgs(args) {
  const { values, positionals } = parseCommandArgs(args, PATH_OPTIONS, pathSchema, { allowPositionals: true });
  const { from, to } = resolveEndpoints(values, positionals);

  if (from === null || to === null) {
    throw usageError('Path requires --from and --to (or two positional ids)');
  }

  const labels = values.labels.flatMap(
    (/** @type {string} */ l) => l.split(',').map((/** @type {string} */ s) => s.trim()).filter((/** @type {string} */ s) => s.length > 0),
  );
  const labelFilter = deriveLabelFilter(labels);

  return { from, to, dir: values.dir, labelFilter, maxDepth: values.maxDepth };
}

/**
 * Checks whether the view option requests SVG or HTML rendering.
 * @param {string|null} view - The --view flag value.
 * @returns {boolean} True if the view is an SVG or HTML view prefix.
 */
function isRenderedView(view) {
  if (typeof view !== 'string') {
    return false;
  }
  return view.startsWith('svg:') || view.startsWith('html:');
}

/**
 * Attaches a pre-rendered SVG to the payload when the view option requests it.
 * @param {Record<string, unknown>} payload - The output payload object.
 * @param {string|null} view - The --view flag value.
 * @param {string} graphName - Name of the graph for the SVG title.
 * @returns {Promise<void>}
 */
async function attachRenderedSvg(payload, view, graphName) {
  if (!isRenderedView(view)) {
    return;
  }
  const graphData = pathResultToGraphData(payload);
  const positioned = await layoutGraph(graphData, { type: 'path' });
  payload._renderedSvg = renderSvg(positioned, { title: `${graphName} path` });
}

/**
 * @typedef {Object} TraversalContext
 * @property {import('../types.js').WarpGraphInstance} graph - The opened warp graph instance.
 * @property {string} graphName - Name of the graph.
 * @property {string|null} view - The --view flag value.
 */

/**
 * Runs the shortest-path traversal and builds the result payload.
 * @param {TraversalContext} ctx - Graph context for the traversal.
 * @param {PathOptions} pathOptions - Parsed path command options.
 * @returns {Promise<{payload: Record<string, unknown>, exitCode: number}>} The result payload and exit code.
 */
async function runPathTraversal(ctx, pathOptions) {
  const { graph, graphName, view } = ctx;
  /** @type {PathResult} */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- traverse.shortestPath is typed as Function in WarpGraphInstance
  const result = await graph.traverse.shortestPath(
    pathOptions.from,
    pathOptions.to,
    {
      dir: pathOptions.dir,
      labelFilter: pathOptions.labelFilter,
      maxDepth: pathOptions.maxDepth,
    },
  );

  /** @type {Record<string, unknown>} */
  const payload = {
    graph: graphName,
    from: pathOptions.from,
    to: pathOptions.to,
    ...result,
  };

  if (result.found) {
    await attachRenderedSvg(payload, view, graphName);
  }

  const exitCode = result.found ? EXIT_CODES.OK : EXIT_CODES.NO_MATCH;
  return { payload, exitCode };
}

/**
 * Handles the `path` command: finds a shortest path between two nodes.
 * @param {{options: CliOptions, args: string[]}} params - CLI options and raw argument tokens.
 * @returns {Promise<{payload: unknown, exitCode: number}>} The result payload and exit code.
 */
export default async function handlePath({ options, args }) {
  const pathOptions = parsePathArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  try {
    return await runPathTraversal({ graph, graphName, view: options.view }, pathOptions);
  } catch (error) {
    if (error instanceof Error && /** @type {{code?: string}} */ (error).code === 'NODE_NOT_FOUND') {
      throw notFoundError(error.message);
    }
    throw error;
  }
}
