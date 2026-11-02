import { Dot } from '../../crdt/Dot.ts';
import BlobValue from '../../types/ops/BlobValue.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import PropSet from '../../types/ops/PropSet.ts';
import type { PatchOp } from '../../types/ops/unions.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import { decodeLegacyEdgePropNode, encodeEdgeKey, isLegacyEdgePropNode } from '../KeyCodec.ts';
import ConeDotMention from './ConeDotMention.ts';

/** The collected parts a footprint is built from. */
export type ConeFootprintParts = {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
  readonly mentions: readonly ConeDotMention[];
  readonly nodeTombstones: ReadonlyMap<string, ReadonlySet<string>>;
  readonly edgeTombstones: ReadonlyMap<string, ReadonlySet<string>>;
};

/**
 * Accumulates the elements one patch's operations name.
 *
 * Every runtime operation class the reducer applies is handled here. A
 * legacy `PropSet` is read the way the reducer's normalizer reads it: a
 * `\x01`-prefixed node names an edge property, anything else a node
 * property. A `BlobValue` names its node although it changes no state. An
 * operation that is not a runtime operation instance is refused rather than
 * guessed at, because the reducer would hydrate it on its own terms.
 */
export default class ConeFootprintCollector {
  readonly #nodes = new Set<string>();
  readonly #edges = new Set<string>();
  readonly #mentions: ConeDotMention[] = [];
  readonly #nodeTombstones = new Map<string, Set<string>>();
  readonly #edgeTombstones = new Map<string, Set<string>>();

  /** Records the elements one canonical operation names. */
  collect(op: PatchOp): void {
    if (op instanceof PropSet) {
      this.#collectLegacyPropSet(op);
    } else if (!this.#collectNodeOp(op) && !this.#collectEdgeOp(op)) {
      throw new ConeRecordError('Cone footprint requires runtime patch operations', {
        code: 'E_CONE_UNKNOWN_OP',
      });
    }
  }

  parts(): ConeFootprintParts {
    return { nodes: this.#nodes, edges: this.#edges, mentions: this.#mentions,
      nodeTombstones: this.#nodeTombstones, edgeTombstones: this.#edgeTombstones };
  }

  #collectLegacyPropSet(op: PropSet): void {
    if (isLegacyEdgePropNode(op.node)) {
      this.#edge(decodeLegacyEdgePropNode(op.node));
    } else {
      this.#nodes.add(op.node);
    }
  }

  #collectNodeOp(op: PatchOp): boolean {
    if (op instanceof NodeAdd) {
      this.#nodes.add(op.node);
      this.#mention({ set: 'node', encodedDot: Dot.encode(op.dot), element: op.node, role: 'owner' });
      return true;
    }
    if (op instanceof NodeRemove) {
      this.#nodes.add(op.node);
      this.#removal({ set: 'node', element: op.node, dots: op.observedDots, into: this.#nodeTombstones });
      return true;
    }
    if (op instanceof NodePropSet || op instanceof BlobValue) {
      this.#nodes.add(op.node);
      return true;
    }
    return false;
  }

  #collectEdgeOp(op: PatchOp): boolean {
    if (op instanceof EdgeAdd) {
      const edgeKey = this.#edge(op);
      this.#mention({ set: 'edge', encodedDot: Dot.encode(op.dot), element: edgeKey, role: 'owner' });
      return true;
    }
    if (op instanceof EdgeRemove) {
      const edgeKey = this.#edge(op);
      this.#removal({ set: 'edge', element: edgeKey, dots: op.observedDots, into: this.#edgeTombstones });
      return true;
    }
    if (op instanceof EdgePropSet) {
      this.#edge(op);
      return true;
    }
    return false;
  }

  /** Names an edge and both endpoints, whose adjacency the edge may join. */
  #edge(op: { readonly from: string; readonly to: string; readonly label: string }): string {
    const edgeKey = encodeEdgeKey(op.from, op.to, op.label);
    this.#edges.add(edgeKey);
    this.#nodes.add(op.from);
    this.#nodes.add(op.to);
    return edgeKey;
  }

  #removal(removal: {
    readonly set: 'node' | 'edge';
    readonly element: string;
    readonly dots: readonly string[];
    readonly into: Map<string, Set<string>>;
  }): void {
    const named = removal.into.get(removal.element) ?? new Set<string>();
    for (const encodedDot of removal.dots) {
      named.add(encodedDot);
      this.#mention({ set: removal.set, encodedDot, element: removal.element, role: 'remover' });
    }
    removal.into.set(removal.element, named);
  }

  #mention(fields: ConstructorParameters<typeof ConeDotMention>[0]): void {
    this.#mentions.push(new ConeDotMention(fields));
  }
}
