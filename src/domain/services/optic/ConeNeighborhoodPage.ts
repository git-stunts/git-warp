import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConeNeighbourhood from '../cone/ConeNeighbourhood.ts';
import type ConeEdgeRecord from '../cone/ConeEdgeRecord.ts';
import { edgeVisible } from '../state/StateSerializer.ts';
import type WarpState from '../state/WarpState.ts';
import ConeNeighborhoodCursor, { type ConeNeighborhoodCursorScope } from './ConeNeighborhoodCursor.ts';
import type { NeighborhoodOpticEdge, NeighborhoodOpticReadDirection } from './NeighborhoodOpticReadResult.ts';
import { parseNeighborhoodLimit } from './NeighborhoodPageCursor.ts';

/** One page request: scope, page size and the cursor to resume after. */
export type ConeNeighborhoodPageRequest = ConeNeighborhoodCursorScope & {
  readonly limit: number | undefined;
  readonly cursor: string | undefined;
};

/** Directions in page order; `both` lists incoming edges first, as checkpoint pages do. */
const INCOMING: readonly NeighborhoodOpticReadDirection[] = Object.freeze(['in']);
const OUTGOING: readonly NeighborhoodOpticReadDirection[] = Object.freeze(['out']);
const DIRECTIONS: Readonly<Record<Direction, readonly NeighborhoodOpticReadDirection[]>> = Object.freeze({
  in: INCOMING,
  out: OUTGOING,
  both: Object.freeze([...INCOMING, ...OUTGOING]),
});

/**
 * One page of a node's visible neighbourhood, read from its cone records.
 *
 * Every incident edge of the node is known from its adjacency pages, so the
 * page sorts the visible ones canonically (direction, neighbour id, label)
 * and resumes strictly after the cursor. An edge is visible when it is alive
 * and both endpoints are alive, exactly as in a full reduction.
 */
export default class ConeNeighborhoodPage {
  readonly edges: readonly NeighborhoodOpticEdge[];
  /** The cursor that continues after this page, or null when the neighbourhood is exhausted. */
  readonly cursor: string | null;
  /** Per returned edge, the cursor that resumes at that edge (null: from the start). */
  readonly resumeCursors: readonly (string | null)[];

  private constructor(fields: {
    readonly edges: readonly NeighborhoodOpticEdge[];
    readonly cursor: string | null;
    readonly resumeCursors: readonly (string | null)[];
  }) {
    this.edges = Object.freeze([...fields.edges]);
    this.cursor = fields.cursor;
    this.resumeCursors = Object.freeze([...fields.resumeCursors]);
    Object.freeze(this);
  }

  static read(neighbourhood: ConeNeighbourhood, request: ConeNeighborhoodPageRequest): ConeNeighborhoodPage {
    const limit = parseNeighborhoodLimit(request.limit ?? null);
    const after = ConeNeighborhoodCursor.parse(request.cursor, request);
    const remaining = visibleEdges(neighbourhood, request).filter((edge) => after === null || compareEdge(edge, after) > 0);
    const edges = remaining.slice(0, limit);
    const resumeCursors: Array<string | null> = [];
    let last = after;
    for (const edge of edges) {
      resumeCursors.push(encodedOrNull(last, request));
      last = new ConeNeighborhoodCursor(edge);
    }
    return new ConeNeighborhoodPage({
      edges,
      cursor: remaining.length > limit ? encodedOrNull(last, request) : null,
      resumeCursors,
    });
  }
}

function visibleEdges(neighbourhood: ConeNeighbourhood, scope: ConeNeighborhoodCursorScope): NeighborhoodOpticEdge[] {
  const state = neighbourhood.state();
  const labels = new Set(scope.labels);
  return DIRECTIONS[scope.direction].flatMap((direction) => neighbourhood.edges
    .filter((edge) => isSelected({ edge, state, labels }))
    .flatMap((edge) => incidentEdge(edge, { nodeId: scope.nodeId, direction }))
    .sort(compareEdge));
}

function isSelected(candidate: { readonly edge: ConeEdgeRecord; readonly state: WarpState; readonly labels: ReadonlySet<string> }): boolean {
  const { edge, state, labels } = candidate;
  return (labels.size === 0 || labels.has(edge.label)) && edgeVisible(state, edge.edgeKey);
}

function incidentEdge(
  edge: ConeEdgeRecord,
  side: { readonly nodeId: string; readonly direction: NeighborhoodOpticReadDirection },
): NeighborhoodOpticEdge[] {
  const neighborId = side.direction === 'out' ? edge.to : edge.from;
  const own = side.direction === 'out' ? edge.from : edge.to;
  return own === side.nodeId ? [Object.freeze({ direction: side.direction, neighborId, label: edge.label })] : [];
}

function compareEdge(left: NeighborhoodOpticEdge | ConeNeighborhoodCursor, right: NeighborhoodOpticEdge | ConeNeighborhoodCursor): number {
  return compareStrings(left.direction, right.direction)
    || compareStrings(left.neighborId, right.neighborId)
    || compareStrings(left.label, right.label);
}

function encodedOrNull(position: ConeNeighborhoodCursor | null, scope: ConeNeighborhoodCursorScope): string | null {
  return position === null ? null : position.encode(scope);
}
