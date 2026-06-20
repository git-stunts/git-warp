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

function freezeObject<T extends object>(value: T): T {
  Object.freeze(value);
  return value;
}

function copyStringArray(values: readonly string[]): string[] {
  return freezeObject([...values]);
}

function copySide(side: CoordinateComparisonSide): CoordinateComparisonSide {
  const resolved: CoordinateComparisonSide['resolved'] = side.resolved.strand === undefined
    ? {
        ...side.resolved,
        patchFrontier: freezeObject({ ...side.resolved.patchFrontier }),
        lamportFrontier: freezeObject({ ...side.resolved.lamportFrontier }),
        summary: freezeObject({ ...side.resolved.summary }),
      }
    : {
        ...side.resolved,
        patchFrontier: freezeObject({ ...side.resolved.patchFrontier }),
        lamportFrontier: freezeObject({ ...side.resolved.lamportFrontier }),
        summary: freezeObject({ ...side.resolved.summary }),
        strand: freezeObject({
          ...side.resolved.strand,
          braid: freezeObject({
            readOverlayCount: side.resolved.strand.braid.readOverlayCount,
            braidedStrandIds: copyStringArray(side.resolved.strand.braid.braidedStrandIds),
          }),
        }),
      };
  return freezeObject({
    requested: freezeObject({ ...side.requested }),
    resolved: freezeObject(resolved),
  });
}

function copyScope(scope: VisibleStateScope): VisibleStateScope {
  return freezeObject({
    ...(scope.nodeIdPrefixes !== undefined
      ? {
          nodeIdPrefixes: freezeObject({
            ...(scope.nodeIdPrefixes.include !== undefined
              ? { include: copyStringArray(scope.nodeIdPrefixes.include) }
              : {}),
            ...(scope.nodeIdPrefixes.exclude !== undefined
              ? { exclude: copyStringArray(scope.nodeIdPrefixes.exclude) }
              : {}),
          }),
        }
      : {}),
  });
}

function copySummary(summary: VisibleStateComparison['summary']): VisibleStateComparison['summary'] {
  return freezeObject({
    left: freezeObject({ ...summary.left }),
    right: freezeObject({ ...summary.right }),
    nodes: freezeObject({ ...summary.nodes }),
    edges: freezeObject({ ...summary.edges }),
    nodeProperties: freezeObject({ ...summary.nodeProperties }),
    edgeProperties: freezeObject({ ...summary.edgeProperties }),
  });
}

function copyNodes(nodes: VisibleStateComparison['nodes']): VisibleStateComparison['nodes'] {
  return freezeObject({
    added: copyStringArray(nodes.added),
    removed: copyStringArray(nodes.removed),
  });
}

function copyObjectArray<T extends object>(values: readonly T[]): T[] {
  return freezeObject(values.map((value) => freezeObject({ ...value })));
}

function copyEdges(edges: VisibleStateComparison['edges']): VisibleStateComparison['edges'] {
  return freezeObject({
    added: copyObjectArray(edges.added),
    removed: copyObjectArray(edges.removed),
  });
}

function copyNodeProperties(
  delta: VisibleStateComparison['nodeProperties'],
): VisibleStateComparison['nodeProperties'] {
  return freezeObject({
    added: copyObjectArray(delta.added),
    removed: copyObjectArray(delta.removed),
    changed: copyObjectArray(delta.changed),
  });
}

function copyEdgeProperties(
  delta: VisibleStateComparison['edgeProperties'],
): VisibleStateComparison['edgeProperties'] {
  return freezeObject({
    added: copyObjectArray(delta.added),
    removed: copyObjectArray(delta.removed),
    changed: copyObjectArray(delta.changed),
  });
}

function copyPatchDivergence(
  divergence: CoordinateComparison['visiblePatchDivergence'],
): CoordinateComparison['visiblePatchDivergence'] {
  const copied: CoordinateComparison['visiblePatchDivergence'] = divergence.target === undefined
    ? {
        sharedCount: divergence.sharedCount,
        leftOnlyCount: divergence.leftOnlyCount,
        rightOnlyCount: divergence.rightOnlyCount,
        leftOnlyPatchShas: copyStringArray(divergence.leftOnlyPatchShas),
        rightOnlyPatchShas: copyStringArray(divergence.rightOnlyPatchShas),
      }
    : {
        sharedCount: divergence.sharedCount,
        leftOnlyCount: divergence.leftOnlyCount,
        rightOnlyCount: divergence.rightOnlyCount,
        leftOnlyPatchShas: copyStringArray(divergence.leftOnlyPatchShas),
        rightOnlyPatchShas: copyStringArray(divergence.rightOnlyPatchShas),
        target: freezeObject({
          ...divergence.target,
          leftOnlyPatchShas: copyStringArray(divergence.target.leftOnlyPatchShas),
          rightOnlyPatchShas: copyStringArray(divergence.target.rightOnlyPatchShas),
        }),
      };
  return freezeObject(copied);
}
