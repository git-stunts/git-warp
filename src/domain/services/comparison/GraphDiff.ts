import QueryError from '../../errors/QueryError.ts';
import type {
  CoordinateComparison,
  CoordinateComparisonSide,
  VisibleStateComparison,
  VisibleStateScope,
} from '../../types/CoordinateComparison.ts';

export type GraphDiffFields = {
  readonly comparison: CoordinateComparison;
};

const GRAPH_DIFF_VERSION = 'graph-diff/v1';

/** First-class graph delta result over two resolved coordinates. */
export default class GraphDiff {
  readonly diffVersion = GRAPH_DIFF_VERSION;
  readonly comparisonDigest: string;
  readonly left: CoordinateComparisonSide;
  readonly right: CoordinateComparisonSide;
  readonly scope: VisibleStateScope | undefined;
  readonly changed: boolean;
  readonly summary: VisibleStateComparison['summary'];
  readonly nodes: VisibleStateComparison['nodes'];
  readonly edges: VisibleStateComparison['edges'];
  readonly nodeProperties: VisibleStateComparison['nodeProperties'];
  readonly edgeProperties: VisibleStateComparison['edgeProperties'];
  readonly visiblePatchDivergence: CoordinateComparison['visiblePatchDivergence'];

  constructor(fields: GraphDiffFields) {
    const comparison = requireComparison(requireFields(fields).comparison);
    this.comparisonDigest = comparison.comparisonDigest;
    this.left = copySide(comparison.left);
    this.right = copySide(comparison.right);
    this.scope = comparison.scope !== undefined ? copyScope(comparison.scope) : undefined;
    this.changed = comparison.visibleState.changed;
    this.summary = copySummary(comparison.visibleState.summary);
    this.nodes = copyNodes(comparison.visibleState.nodes);
    this.edges = copyEdges(comparison.visibleState.edges);
    this.nodeProperties = copyNodeProperties(comparison.visibleState.nodeProperties);
    this.edgeProperties = copyEdgeProperties(comparison.visibleState.edgeProperties);
    this.visiblePatchDivergence = copyPatchDivergence(comparison.visiblePatchDivergence);
    Object.freeze(this);
  }
}

function requireFields(fields: GraphDiffFields | null | undefined): GraphDiffFields {
  if (fields === null || fields === undefined) {
    throw new QueryError('GraphDiff fields must be provided', {
      code: 'E_GRAPH_DIFF',
    });
  }
  return fields;
}

function requireComparison(comparison: CoordinateComparison): CoordinateComparison {
  if (comparison === null || typeof comparison !== 'object') {
    throw new QueryError('GraphDiff requires a coordinate comparison', {
      code: 'E_GRAPH_DIFF',
    });
  }
  return comparison;
}

function copySide(side: CoordinateComparisonSide): CoordinateComparisonSide {
  return {
    requested: { ...side.requested },
    resolved: {
      ...side.resolved,
      patchFrontier: { ...side.resolved.patchFrontier },
      lamportFrontier: { ...side.resolved.lamportFrontier },
      summary: { ...side.resolved.summary },
      ...(side.resolved.strand !== undefined
        ? {
            strand: {
              ...side.resolved.strand,
              braid: {
                readOverlayCount: side.resolved.strand.braid.readOverlayCount,
                braidedStrandIds: [...side.resolved.strand.braid.braidedStrandIds],
              },
            },
          }
        : {}),
    },
  };
}

function copyScope(scope: VisibleStateScope): VisibleStateScope {
  return {
    ...(scope.nodeIdPrefixes !== undefined
      ? {
          nodeIdPrefixes: {
            ...(scope.nodeIdPrefixes.include !== undefined
              ? { include: [...scope.nodeIdPrefixes.include] }
              : {}),
            ...(scope.nodeIdPrefixes.exclude !== undefined
              ? { exclude: [...scope.nodeIdPrefixes.exclude] }
              : {}),
          },
        }
      : {}),
  };
}

function copySummary(summary: VisibleStateComparison['summary']): VisibleStateComparison['summary'] {
  return {
    left: { ...summary.left },
    right: { ...summary.right },
    nodes: { ...summary.nodes },
    edges: { ...summary.edges },
    nodeProperties: { ...summary.nodeProperties },
    edgeProperties: { ...summary.edgeProperties },
  };
}

function copyNodes(nodes: VisibleStateComparison['nodes']): VisibleStateComparison['nodes'] {
  return {
    added: [...nodes.added],
    removed: [...nodes.removed],
  };
}

function copyObjectArray<T extends object>(values: readonly T[]): T[] {
  return values.map((value) => ({ ...value }));
}

function copyEdges(edges: VisibleStateComparison['edges']): VisibleStateComparison['edges'] {
  return {
    added: copyObjectArray(edges.added),
    removed: copyObjectArray(edges.removed),
  };
}

function copyNodeProperties(
  delta: VisibleStateComparison['nodeProperties'],
): VisibleStateComparison['nodeProperties'] {
  return {
    added: copyObjectArray(delta.added),
    removed: copyObjectArray(delta.removed),
    changed: copyObjectArray(delta.changed),
  };
}

function copyEdgeProperties(
  delta: VisibleStateComparison['edgeProperties'],
): VisibleStateComparison['edgeProperties'] {
  return {
    added: copyObjectArray(delta.added),
    removed: copyObjectArray(delta.removed),
    changed: copyObjectArray(delta.changed),
  };
}

function copyPatchDivergence(
  divergence: CoordinateComparison['visiblePatchDivergence'],
): CoordinateComparison['visiblePatchDivergence'] {
  return {
    sharedCount: divergence.sharedCount,
    leftOnlyCount: divergence.leftOnlyCount,
    rightOnlyCount: divergence.rightOnlyCount,
    leftOnlyPatchShas: [...divergence.leftOnlyPatchShas],
    rightOnlyPatchShas: [...divergence.rightOnlyPatchShas],
    ...(divergence.target !== undefined
      ? {
          target: {
            ...divergence.target,
            leftOnlyPatchShas: [...divergence.target.leftOnlyPatchShas],
            rightOnlyPatchShas: [...divergence.target.rightOnlyPatchShas],
          },
        }
      : {}),
  };
}
