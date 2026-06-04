/**
 * NeighborProvider backed by bitmap indexes.
 *
 * Two modes:
 * 1. **Commit DAG** (`indexReader`): Wraps BitmapIndexReader for parent/child
 *    relationships. Edges use label = '' (empty string sentinel).
 * 2. **Logical graph** (`logicalIndex`): Wraps CBOR-based logical bitmap index
 *    with labeled edges, per-label bitmap filtering, and alive bitmap checks.
 *
 * @module domain/services/index/BitmapNeighborProvider
 */

import NeighborProviderPort, {
  type Direction,
  type NeighborOptions,
  type NeighborEdge,
} from '../../../ports/NeighborProviderPort.ts';
import IndexError from '../../errors/IndexError.ts';
import type BitmapIndexReader from './BitmapIndexReader.ts';

export interface LogicalIndex {
  getGlobalId(nodeId: string): number | undefined;
  isAlive(nodeId: string): boolean;
  getNodeId(globalId: number): string | undefined;
  getEdges(nodeId: string, direction: string, labelIds?: number[]): Array<{ neighborId: string; label: string }>;
  getLabelRegistry(): Map<string, number>;
}

function sortEdges(edges: Array<NeighborEdge>): Array<NeighborEdge> {
  return edges.sort((a, b) => {
    if (a.neighborId < b.neighborId) { return -1; }
    if (a.neighborId > b.neighborId) { return 1; }
    if (a.label < b.label) { return -1; }
    if (a.label > b.label) { return 1; }
    return 0;
  });
}

function dedupSorted(edges: Array<NeighborEdge>): Array<NeighborEdge> {
  if (edges.length <= 1) { return edges; }
  const first = edges[0];
  if (first === undefined || first === null) { return edges; }
  const result: NeighborEdge[] = [first];
  for (let i = 1; i < edges.length; i++) {
    const prev = result[result.length - 1];
    const curr = edges[i];
    if (
      prev !== undefined && prev !== null &&
      curr !== undefined && curr !== null &&
      (curr.neighborId !== prev.neighborId || curr.label !== prev.label)
    ) {
      result.push(curr);
    }
  }
  return result;
}

export default class BitmapNeighborProvider extends NeighborProviderPort {
  private readonly _reader: BitmapIndexReader | null;
  private readonly _logical: LogicalIndex | null;

  constructor(params?: { indexReader?: BitmapIndexReader; logicalIndex?: LogicalIndex }) {
    const { indexReader, logicalIndex } = params ?? {};
    super();
    this._reader = indexReader ?? null;
    this._logical = logicalIndex ?? null;
  }

  private _assertReady(): void {
    if (!this._reader && !this._logical) {
      throw new IndexError(
        'BitmapNeighborProvider requires either indexReader or logicalIndex',
        { code: 'E_NEIGHBOR_PROVIDER_NO_BACKEND' },
      );
    }
  }

  async getNeighbors(nodeId: string, direction: Direction, options?: NeighborOptions): Promise<NeighborEdge[]> {
    this._assertReady();
    if (this._logical) {
      return this._getLogicalNeighbors(nodeId, direction, options);
    }
    return await this._getDagNeighbors(nodeId, direction, options);
  }

  async hasNode(nodeId: string): Promise<boolean> {
    this._assertReady();
    if (this._logical) {
      return this._logical.isAlive(nodeId);
    }
    if (this._reader) {
      const id = await this._reader.lookupId(nodeId);
      return id !== undefined;
    }
    throw new IndexError(
      'BitmapNeighborProvider readiness check passed without an active backend',
      { code: 'E_NEIGHBOR_PROVIDER_INVALID_BACKEND' },
    );
  }

  override get latencyClass(): 'async-local' {
    return 'async-local';
  }

  // ── Commit DAG mode ─────────────────────────────────────────────────

  private async _getDagSingleDirection(
    reader: BitmapIndexReader,
    nodeId: string,
    dir: 'out' | 'in',
  ): Promise<NeighborEdge[]> {
    const shas = dir === 'out'
      ? await reader.getChildren(nodeId)
      : await reader.getParents(nodeId);
    return sortEdges(shas.map((id) => ({ neighborId: id, label: '' })));
  }

  private _dagLabelsExcluded(options?: NeighborOptions): boolean {
    return options?.labels !== undefined && options?.labels !== null && !options.labels.has('');
  }

  private async _getDagNeighbors(
    nodeId: string,
    direction: Direction,
    options?: NeighborOptions,
  ): Promise<NeighborEdge[]> {
    if (!this._reader) { return []; }
    if (this._dagLabelsExcluded(options)) { return []; }

    if (direction === 'out' || direction === 'in') {
      return await this._getDagSingleDirection(this._reader, nodeId, direction);
    }

    return await this._getDagBothDirections(this._reader, nodeId);
  }

  private async _getDagBothDirections(reader: BitmapIndexReader, nodeId: string): Promise<NeighborEdge[]> {
    const [children, parents] = await Promise.all([
      reader.getChildren(nodeId),
      reader.getParents(nodeId),
    ]);
    const all = children.map((id) => ({ neighborId: id, label: '' }))
      .concat(parents.map((id) => ({ neighborId: id, label: '' })));
    return dedupSorted(sortEdges(all));
  }

  // ── Logical graph mode ──────────────────────────────────────────────

  private _resolveLabelIds(logical: LogicalIndex, labels: Set<string>): number[] | undefined {
    const registry = logical.getLabelRegistry();
    const ids: number[] = [];
    for (const label of labels) {
      const id = registry.get(label);
      if (id !== undefined) {
        ids.push(id);
      }
    }
    return ids;
  }

  private _getLogicalNeighbors(
    nodeId: string,
    direction: Direction,
    options?: NeighborOptions,
  ): NeighborEdge[] {
    const logical = this._logical!;

    let labelIds: number[] | undefined;
    if (options?.labels) {
      labelIds = this._resolveLabelIds(logical, options.labels);
      if (labelIds === undefined || labelIds.length === 0) { return []; }
    }

    if (direction === 'both') {
      const outEdges = logical.getEdges(nodeId, 'out', labelIds);
      const inEdges = logical.getEdges(nodeId, 'in', labelIds);
      return dedupSorted(sortEdges([...outEdges, ...inEdges]));
    }

    return sortEdges(logical.getEdges(nodeId, direction, labelIds));
  }
}
