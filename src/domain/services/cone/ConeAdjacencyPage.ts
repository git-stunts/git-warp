import ConeRecordError from '../../errors/ConeRecordError.ts';
import ConeRecordKey, { type ConeDirection } from './ConeRecordKey.ts';
import { requireCount, requireIdentity } from './ConeRecordValidation.ts';

/** Maximum edge keys one adjacency page holds; a hub spreads over many pages. */
export const CONE_ADJACENCY_PAGE_SIZE = 256;

const DIRECTIONS: ReadonlySet<string> = new Set(['out', 'in']);

/** Constructor fields of an adjacency page. */
export type ConeAdjacencyPageFields = {
  readonly nodeId: string;
  readonly direction: ConeDirection;
  readonly pageIndex: number;
  readonly edgeKeys: readonly string[];
};

/**
 * One bounded page of the edge keys ever registered with a node as `from`
 * (`out`) or `to` (`in`), in registration order. A node record counts its
 * registered edge keys per direction; edge key `i` lives on page
 * `floor(i / size)`, so appending touches only the last page and reading a
 * neighbourhood pages through the hub instead of loading it whole.
 */
export default class ConeAdjacencyPage {
  readonly nodeId: string;
  readonly direction: ConeDirection;
  readonly pageIndex: number;
  readonly edgeKeys: readonly string[];

  constructor(fields: ConeAdjacencyPageFields) {
    if (!DIRECTIONS.has(fields.direction)) {
      throw new ConeRecordError(`Unknown cone adjacency direction ${String(fields.direction)}`);
    }
    this.nodeId = requireIdentity(fields.nodeId, 'nodeId');
    this.direction = fields.direction;
    this.pageIndex = requireCount(fields.pageIndex, 'pageIndex');
    this.edgeKeys = requireEdgeKeys(fields.edgeKeys);
    Object.freeze(this);
  }

  static empty(nodeId: string, direction: ConeDirection, pageIndex: number): ConeAdjacencyPage {
    return new ConeAdjacencyPage({ nodeId, direction, pageIndex, edgeKeys: [] });
  }

  /** The page holding the edge key registered at `position`. */
  static pageOf(position: number): number {
    return Math.floor(position / CONE_ADJACENCY_PAGE_SIZE);
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forAdjacencyPage(this.nodeId, this.direction, this.pageIndex);
  }

  withEdgeKey(edgeKey: string): ConeAdjacencyPage {
    return new ConeAdjacencyPage({ ...this, edgeKeys: [...this.edgeKeys, edgeKey] });
  }

  equals(other: ConeAdjacencyPage): boolean {
    return other.nodeId === this.nodeId
      && other.direction === this.direction
      && other.pageIndex === this.pageIndex
      && other.edgeKeys.length === this.edgeKeys.length
      && other.edgeKeys.every((edgeKey, index) => edgeKey === this.edgeKeys[index]);
  }
}

function requireEdgeKeys(edgeKeys: readonly string[]): readonly string[] {
  const copied: string[] = [...edgeKeys];
  if (copied.length > CONE_ADJACENCY_PAGE_SIZE) {
    throw new ConeRecordError(`Cone adjacency page holds at most ${CONE_ADJACENCY_PAGE_SIZE} edge keys`);
  }
  for (const edgeKey of copied) {
    requireIdentity(edgeKey, 'edgeKey');
  }
  return Object.freeze(copied);
}
