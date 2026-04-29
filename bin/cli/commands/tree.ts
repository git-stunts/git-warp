import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.ts';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.ts';
import { z } from 'zod';
import type { CliOptions } from '../types.ts';
import ImmutableBytes from '../../../src/domain/services/snapshot/ImmutableBytes.ts';
import type { SnapshotPropValue } from '../../../src/domain/services/snapshot/SnapshotPropValue.ts';

type TreeProps = Readonly<{ [key: string]: SnapshotPropValue }>;
type TreeEdge = {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
};
type TreeChild = {
  readonly id: string;
  readonly label: string;
};
type TreeChildMap = Map<string, TreeChild[]>;
type TreeRow = {
  id: string;
  props?: TreeProps;
};
type TreeCommandResult = {
  payload: unknown;
  exitCode: number;
};
type TreeRenderParams = {
  nodeId: string;
  childMap: TreeChildMap;
  propsMap: Map<string, TreeProps>;
  propKeys: string[];
  prefix: string;
  isLast: boolean;
  visited: Set<string>;
  depth: number;
  maxDepth: number | undefined;
  lines: string[];
};

function formatSnapshotPropValue(value: SnapshotPropValue): string {
  if (value instanceof ImmutableBytes) {
    return `bytes(${value.length})`;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatSnapshotPropValue(entry)).join(', ')}]`;
  }
  return `{${Object.entries(value)
    .map(([key, entry]) => `${key}: ${formatSnapshotPropValue(entry)}`)
    .join(', ')}}`;
}

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
  props: Array.isArray(val.prop) ? val.prop : val.prop !== undefined ? [val.prop] : [],
  maxDepth: val['max-depth'],
}));

/** Builds a parent-to-children adjacency map from edges. */
function buildChildMap(edges: TreeEdge[], labelFilter: string | null): TreeChildMap {
  const children: TreeChildMap = new Map();
  const hasParent: Set<string> = new Set();

  for (const edge of edges) {
    if (labelFilter !== null && edge.label !== labelFilter) {
      continue;
    }
    if (!children.has(edge.from)) {
      children.set(edge.from, []);
    }
    const fromChildren = children.get(edge.from);
    if (fromChildren !== undefined) {
      fromChildren.push({ id: edge.to, label: edge.label ?? '' });
    }
    hasParent.add(edge.to);
  }

  return children;
}

/** Finds root nodes (nodes with outgoing edges but no incoming edges in the filtered set). */
function findRoots(nodeIds: string[], edges: TreeEdge[], labelFilter: string | null): string[] {
  const hasParent = new Set<string>();
  const hasChild = new Set<string>();

  for (const edge of edges) {
    if (labelFilter !== null && edge.label !== labelFilter) {
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

/** Formats annotation string for a node based on requested props. */
function formatAnnotation(nodeProps: TreeProps, propKeys: string[]): string {
  if (propKeys.length === 0 || nodeProps === undefined || nodeProps === null) {
    return '';
  }
  const parts: string[] = [];
  for (const key of propKeys) {
    if (Object.prototype.hasOwnProperty.call(nodeProps, key)) {
      const propValue = nodeProps[key];
      if (propValue !== undefined) {
        const value = formatSnapshotPropValue(propValue);
        parts.push(`${key}: ${value}`);
      }
    }
  }
  return parts.length > 0 ? `  [${parts.join(', ')}]` : '';
}

/** Renders a tree structure as lines with box-drawing characters. */
function renderTreeNode({ nodeId, childMap, propsMap, propKeys, prefix, isLast, visited, depth, maxDepth, lines }: TreeRenderParams): void {
  const connector = depth === 0 ? '' : (isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ');
  const annotation = formatAnnotation(propsMap.get(nodeId) ?? {}, propKeys);
  lines.push(`${prefix}${connector}${nodeId}${annotation}`);

  if (visited.has(nodeId)) {
    lines.push(`${prefix}${isLast ? '    ' : '\u2502   '}  (cycle)`);
    return;
  }
  visited.add(nodeId);

  if (maxDepth !== undefined && depth >= maxDepth) {
    const kids = childMap.get(nodeId);
    if (kids !== undefined && kids.length > 0) {
      lines.push(`${prefix}${isLast ? '    ' : '\u2502   '}  ... (${kids.length} children)`);
    }
    return;
  }

  const kids = childMap.get(nodeId) ?? [];
  const childPrefix = depth === 0 ? '' : `${prefix}${isLast ? '    ' : '\u2502   '}`;
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (!kid) { continue; }
    renderTreeNode({
      nodeId: kid.id,
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

/** Collects all reachable node IDs via DFS from the given roots. */
function collectReachable(roots: string[], childMap: TreeChildMap, reachable: Set<string>): void {
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (reachable.has(id)) {
      continue;
    }
    reachable.add(id);
    const kids = childMap.get(id) ?? [];
    for (const kid of kids) {
      stack.push(kid.id);
    }
  }
}

/** Handles the `tree` command: renders an ASCII tree from graph edges. */
export default async function handleTree({ options, args }: { options: CliOptions; args: string[] }): Promise<TreeCommandResult> {
  const { values, positionals } = parseCommandArgs(
    args, TREE_OPTIONS, treeSchema, { allowPositionals: true },
  );
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  const queryResult = await graph.query().run();
  if (!('nodes' in queryResult)) {
    throw usageError('Tree query must return node rows');
  }
  const edges = await graph.getEdges();
  const rootArg = positionals[0] ?? null;

  const rows: TreeRow[] = queryResult.nodes
    .filter((node: { id?: string; props?: TreeProps }): node is TreeRow => typeof node.id === 'string');
  const nodeIds = rows.map((node) => node.id);
  const propsMap = new Map<string, TreeProps>(
    rows.map((node): [string, TreeProps] => [node.id, node.props ?? {}]),
  );
  const childMap = buildChildMap(edges, values.edgeLabel);

  const roots = rootArg !== null ? [rootArg] : findRoots(nodeIds, edges, values.edgeLabel);

  if (rootArg !== null && !nodeIds.includes(rootArg)) {
    throw usageError(`Node not found: ${rootArg}`);
  }

  const lines: string[] = [];
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
  const reachable = new Set<string>();
  collectReachable(roots, childMap, reachable);
  const orphans = nodeIds.filter((id: string) => !reachable.has(id));

  const payload = {
    graph: graphName,
    roots,
    tree: lines.join('\n'),
    orphanCount: orphans.length,
    orphans: orphans.length > 0 ? orphans : undefined,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}
