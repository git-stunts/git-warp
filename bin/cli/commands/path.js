import { renderSvg } from '../../../src/visualization/renderers/svg/index.js';
import { layoutGraph, pathResultToGraphData } from '../../../src/visualization/layouts/index.js';
import { EXIT_CODES, usageError, notFoundError, parseCommandArgs } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';
import { pathSchema } from '../schemas.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const PATH_OPTIONS = {
  from: { type: 'string' },
  to: { type: 'string' },
  dir: { type: 'string' },
  label: { type: 'string', multiple: true },
  'max-depth': { type: 'string' },
};

/** @param {string[]} args */
function parsePathArgs(args) {
  const { values, positionals } = parseCommandArgs(args, PATH_OPTIONS, pathSchema, { allowPositionals: true });

  // Positionals can supply from/to when flags are omitted
  const from = values.from || positionals[0] || null;
  const to = values.to || positionals[1] || null;

  if (!from || !to) {
    throw usageError('Path requires --from and --to (or two positional ids)');
  }

  // Expand comma-separated labels
  const labels = values.labels.flatMap((/** @type {string} */ l) => l.split(',').map((/** @type {string} */ s) => s.trim()).filter(Boolean));

  /** @type {string|string[]|undefined} */
  let labelFilter;
  if (labels.length === 1) {
    labelFilter = labels[0];
  } else if (labels.length > 1) {
    labelFilter = labels;
  }

  return { from, to, dir: values.dir, labelFilter, maxDepth: values.maxDepth };
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
