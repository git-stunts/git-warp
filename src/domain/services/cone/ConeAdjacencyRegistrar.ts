import ConeRecordError from '../../errors/ConeRecordError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import { decodeEdgeKey } from '../KeyCodec.ts';
import ConeAdjacencyPage, { CONE_ADJACENCY_PAGE_SIZE } from './ConeAdjacencyPage.ts';
import type ConeFoldSession from './ConeFoldSession.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeRecordKey, { type ConeDirection } from './ConeRecordKey.ts';

/** Node records with their new registrations, and the adjacency pages they appended to. */
export type ConeAdjacencyRegistration = {
  readonly nodes: readonly ConeNodeRecord[];
  readonly pages: readonly ConeAdjacencyPage[];
};

type Slot = { readonly nodeId: string; readonly direction: ConeDirection; readonly position: number; readonly edgeKey: string };

/**
 * Registers newly recorded edge keys with their endpoints: `out` at `from`,
 * `in` at `to`. An edge key is registered once, when its record is first
 * created, so adjacency pages never hold duplicates and a re-added edge
 * costs nothing here.
 */
export default class ConeAdjacencyRegistrar {
  /** Appends each edge key to its endpoints' last adjacency pages. */
  static async register(
    session: ConeFoldSession,
    nodes: readonly ConeNodeRecord[],
    edgeKeys: readonly string[],
  ): Promise<ConeAdjacencyRegistration> {
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const slots = [...edgeKeys].sort(compareStrings).flatMap((edgeKey) => claimSlots(byId, edgeKey));
    const keys = slots.map((slot) => pageKey(slot));
    const snapshot = await session.read(keys);
    const pages = new Map<string, ConeAdjacencyPage>();
    for (const [index, slot] of slots.entries()) {
      const key = keys[index]?.toString() ?? '';
      const page = pages.get(key) ?? snapshot.adjacencyPage(slot.nodeId, slot.direction, ConeAdjacencyPage.pageOf(slot.position));
      requireNextSlot(page, slot);
      pages.set(key, page.withEdgeKey(slot.edgeKey));
    }
    return { nodes: [...byId.values()], pages: [...pages.values()] };
  }
}

function claimSlots(byId: Map<string, ConeNodeRecord>, edgeKey: string): Slot[] {
  const { from, to } = decodeEdgeKey(edgeKey);
  const endpoints: ReadonlyArray<readonly [string, ConeDirection]> = [[from, 'out'], [to, 'in']];
  return endpoints.map(([nodeId, direction]) => {
    const node = byId.get(nodeId);
    if (node === undefined) {
      throw new ConeRecordError('Cone fold registered an edge whose endpoint is outside its footprint', { context: { edgeKey } });
    }
    byId.set(nodeId, node.withRegisteredEdge(direction));
    return { nodeId, direction, position: node.degree(direction), edgeKey };
  });
}

function pageKey(slot: Slot): ConeRecordKey {
  return ConeRecordKey.forAdjacencyPage(slot.nodeId, slot.direction, ConeAdjacencyPage.pageOf(slot.position));
}

function requireNextSlot(page: ConeAdjacencyPage, slot: Slot): void {
  if (page.edgeKeys.length !== slot.position % CONE_ADJACENCY_PAGE_SIZE) {
    throw new ConeRecordError('Cone adjacency page does not end where its node record says', {
      code: 'E_CONE_RECORD_CORRUPT',
      context: { nodeId: slot.nodeId, direction: slot.direction, position: slot.position },
    });
  }
}
