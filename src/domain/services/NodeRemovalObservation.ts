import type LoggerPort from '../../ports/LoggerPort.ts';
import PatchError from '../errors/PatchError.ts';
import NodeRemove from '../types/ops/NodeRemove.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import type WarpState from './state/WarpState.ts';
import { decodeEdgeKey } from './KeyCodec.ts';
import { assertObservedDotsForRemove, findAttachedData } from './PatchBuilderValidation.ts';

/** Exact observed membership and attached-data summary for one removal target. */
export default class NodeRemovalObservation {
  readonly #node: NodeRemove;
  readonly #edges: readonly EdgeRemove[];
  readonly #propertyCount: number;

  constructor(node: NodeRemove, edges: readonly EdgeRemove[], propertyCount: number) {
    if (!(node instanceof NodeRemove) || !Number.isSafeInteger(propertyCount) || propertyCount < 0
      || edges.some((edge) => !(edge instanceof EdgeRemove) || (edge.from !== node.node && edge.to !== node.node))) {
      throw new PatchError('Invalid node removal observation', { code: 'E_PATCH_REMOVAL_BASIS' });
    }
    this.#node = node;
    this.#edges = Object.freeze([...edges]);
    this.#propertyCount = propertyCount;
    Object.freeze(this);
  }

  static fromState(state: WarpState, nodeId: string): NodeRemovalObservation {
    const { edges, props } = findAttachedData(state, nodeId);
    return new NodeRemovalObservation(
      new NodeRemove(nodeId, [...state.nodeAlive.getDots(nodeId)]),
      edges.map((key) => new EdgeRemove({ ...decodeEdgeKey(key), observedDots: [...state.edgeAlive.getDots(key)] })),
      props.length,
    );
  }

  operations(policy: 'reject' | 'cascade' | 'warn', logger: LoggerPort): readonly (NodeRemove | EdgeRemove)[] {
    assertObservedDotsForRemove(this.#node.observedDots, 'node', { nodeId: this.#node.node });
    const edgeCount = this.#edges.length;
    const hasData = edgeCount + this.#propertyCount > 0;
    if (policy !== 'cascade' && hasData) {
      const summary = attachedDataSummary(edgeCount, this.#propertyCount);
      const message = `Cannot delete node '${this.#node.node}': node has attached data (${summary}). Remove edges and properties first, or set onDeleteWithData to 'cascade'.`;
      if (policy === 'reject') {
        throw new PatchError(message, { code: 'E_PATCH_DELETE_WITH_DATA', context: {
          nodeId: this.#node.node, edges: edgeCount, props: this.#propertyCount,
        } });
      }
      logger.warn(`[warp] Deleting node '${this.#node.node}' which has attached data (${summary}). Membership removal does not remove incident edges.`);
    }
    return policy === 'cascade' ? [...this.#edges, this.#node] : [this.#node];
  }
}

function attachedDataSummary(edges: number, properties: number): string {
  const descriptions: string[] = [];
  if (edges > 0) { descriptions.push(`${edges} edge(s)`); }
  if (properties > 0) { descriptions.push(`${properties} propert${properties === 1 ? 'y' : 'ies'}`); }
  return descriptions.join(' and ');
}
