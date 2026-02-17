import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';
import { z } from 'zod';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const TREE_OPTIONS = {
  edge: { type: 'string' },
  prop: { type: 'string', multiple: true },
  'max-depth': { type: 'string' },
};

const treeSchema = z.object({
  edge: z.string().optional(),
  prop: z.union([z.string(), z.array(z.string())]).optional(),
  'max-depth': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val) => ({
  edgeLabel: val.edge ?? null,
  props: Array.isArray(val.prop) ? val.prop : val.prop ? [val.prop] : [],
  maxDepth: val['max-depth'],
}));

/**
 * Builds a parent-to-children adjacency map from edges.
 * @param {Array<{from: string, to: string, label: string}>} edges
 * @param {string|null} labelFilter
 * @returns {Map<string, Array<{id: string, label: string}>>}
 */
function buildChildMap(edges, labelFilter) {
  /** @type {Map<string, Array<{id: string, label: string}>>} */
  const children = new Map();
  /** @type {Set<string>} */
  const hasParent = new Set();

  for (const edge of edges) {
    if (labelFilter && edge.label !== labelFilter) {
      continue;
    }
    if (!children.has(edge.from)) {
      children.set(edge.from, []);
    }
    /** @type {*} */ (children.get(edge.from)).push({ id: edge.to, label: edge.label }); // TODO(ts-cleanup): guarded by has()
    hasParent.add(edge.to);
  }

  return children;
}

/**
 * Finds root nodes (nodes with outgoing edges but no incoming edges in the filtered set).
 * @param {string[]} nodeIds
 * @param {Array<{from: string, to: string, label: string}>} edges
 * @param {string|null} labelFilter
 * @returns {string[]}
 */
function findRoots(nodeIds, edges, labelFilter) {
  const hasParent = new Set();
  const hasChild = new Set();

  for (const edge of edges) {
    if (labelFilter && edge.label !== labelFilter) {
      continue;
    }
    hasParent.add(edge.to);
    hasChild.add(edge.from);
  }

  // Roots: nodes that have children but no parents in the filtered edge set
  const roots = nodeIds.filter((id) => !hasParent.has(id) && hasChild.has(id));
  if (roots.length > 0) {
    return roots.sort();
  }

  // Fallback: nodes with no incoming edges at all
  return nodeIds.filter((id) => !hasParent.has(id)).sort();
}

/**
 * Formats annotation string for a node based on requested props.
 * @param {Record<string, *>} nodeProps
 * @param {string[]} propKeys
 * @returns {string}
 */
function formatAnnotation(nodeProps, propKeys) {
  if (propKeys.length === 0 || !nodeProps) {
    return '';
  }
  const parts = [];
  for (const key of propKeys) {
    if (Object.prototype.hasOwnProperty.call(nodeProps, key)) {
      parts.push(`${key}: ${nodeProps[key]}`);
    }
  }
  return parts.length > 0 ? `  [${parts.join(', ')}]` : '';
}

/**
 * Renders a tree structure as lines with box-drawing characters.
 * @param {object} params
 * @param {string} params.nodeId
 * @param {Map<string, Array<{id: string, label: string}>>} params.childMap
 * @param {Map<string, Record<string, *>>} params.propsMap
 * @param {string[]} params.propKeys
 * @param {string} params.prefix
 * @param {boolean} params.isLast
 * @param {Set<string>} params.visited
 * @param {number} params.depth
 * @param {number|undefined} params.maxDepth
 * @param {string[]} params.lines
 */
function renderTreeNode({ nodeId, childMap, propsMap, propKeys, prefix, isLast, visited, depth, maxDepth, lines }) {
  const connector = depth === 0 ? '' : (isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ');
  const annotation = formatAnnotation(propsMap.get(nodeId) || {}, propKeys);
  lines.push(`${prefix}${connector}${nodeId}${annotation}`);

  if (visited.has(nodeId)) {
    lines.push(`${prefix}${isLast ? '    ' : '\u2502   '}  (cycle)`);
    return;
  }
  visited.add(nodeId);

  if (maxDepth !== undefined && depth >= maxDepth) {
    const kids = childMap.get(nodeId);
    if (kids && kids.length > 0) {
      lines.push(`${prefix}${isLast ? '    ' : '\u2502   '}  ... (${kids.length} children)`);
    }
    return;
  }

  const kids = childMap.get(nodeId) || [];
  const childPrefix = depth === 0 ? '' : `${prefix}${isLast ? '    ' : '\u2502   '}`;
  for (let i = 0; i < kids.length; i++) {
    renderTreeNode({
      nodeId: kids[i].id,
      childMap,
      propsMap,
      propKeys,
      prefix: childPrefix,
      isLast: i === kids.length - 1,
      visited,
      depth: depth + 1,
      maxDepth,
      lines,
    });
  }
}

/**
 * Handles the `tree` command: ASCII tree output from graph edges.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleTree({ options, args }) {
  const { values, positionals } = parseCommandArgs(
    args, TREE_OPTIONS, treeSchema, { allowPositionals: true },
  );
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  const queryResult = await graph.query().run();
  const edges = await graph.getEdges();
  const rootArg = positionals[0] || null;

  const nodeIds = queryResult.nodes.map((/** @type {*} */ n) => n.id); // TODO(ts-cleanup): type CLI payload
  const propsMap = new Map(queryResult.nodes.map((/** @type {*} */ n) => [n.id, n.props || {}])); // TODO(ts-cleanup): type CLI payload
  const childMap = buildChildMap(/** @type {*} */ (edges), values.edgeLabel); // TODO(ts-cleanup): getEdges() label optionality

  const roots = rootArg ? [rootArg] : findRoots(nodeIds, /** @type {*} */ (edges), values.edgeLabel); // TODO(ts-cleanup): getEdges() label optionality

  if (rootArg && !nodeIds.includes(rootArg)) {
    throw usageError(`Node not found: ${rootArg}`);
  }

  /** @type {string[]} */
  const lines = [];
  for (const root of roots) {
    renderTreeNode({
      nodeId: root,
      childMap,
      propsMap,
      propKeys: values.props,
      prefix: '',
      isLast: true,
      visited: new Set(),
      depth: 0,
      maxDepth: values.maxDepth,
      lines,
    });
  }

  // Collect orphans (nodes not reachable from any root)
  const reachable = new Set();
  collectReachable(roots, childMap, reachable);
  const orphans = nodeIds.filter((/** @type {string} */ id) => !reachable.has(id));

  const payload = {
    graph: graphName,
    roots,
    tree: lines.join('\n'),
    orphanCount: orphans.length,
    orphans: orphans.length > 0 ? orphans : undefined,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

/**
 * Collects all reachable node IDs via DFS.
 * @param {string[]} roots
 * @param {Map<string, Array<{id: string, label: string}>>} childMap
 * @param {Set<string>} reachable
 */
function collectReachable(roots, childMap, reachable) {
  const stack = [...roots];
  while (stack.length > 0) {
    const id = /** @type {string} */ (stack.pop());
    if (reachable.has(id)) {
      continue;
    }
    reachable.add(id);
    const kids = childMap.get(id) || [];
    for (const kid of kids) {
      stack.push(kid.id);
    }
  }
}
