import type PatchEntry from '../../artifacts/PatchEntry.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import PropSet from '../../types/ops/PropSet.ts';
import type { PatchOp } from '../../types/ops/unions.ts';
import { EventId } from '../../utils/EventId.ts';
import { decodeLegacyEdgePropNode, encodeEdgeKey, isLegacyEdgePropNode } from '../KeyCodec.ts';
import type ConeConcurrency from './ConeConcurrency.ts';
import ConeElementEffects, { type ConeElementEffect } from './ConeElementEffects.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeObservation from './ConeObservation.ts';

/**
 * Folds one patch into the concurrency its records retain (#1039).
 *
 * Per element the patch contributes its last write to each register and its
 * last lifecycle effect (a remove that observed dots, or an add or property
 * edit), each at the event the reducer gives that operation, so the LWW
 * winner the reducer keeps is always one of the register's members. A
 * remove that observed no dot removes nothing and is not an effect.
 */
export default class ConeConcurrencyFold {
  readonly #observation: ConeObservation;
  readonly #nodes: ConeElementEffects;
  readonly #edges: ConeElementEffects;

  private constructor(entry: PatchEntry, implicit: ReadonlyMap<string, number>) {
    this.#observation = ConeObservation.ofPatch(entry, implicit);
    this.#nodes = new ConeElementEffects(this.#observation.causal);
    this.#edges = new ConeElementEffects(this.#observation.causal);
    entry.patch.ops.forEach((op, index) => {
      const event = new EventId(entry.patch.lamport, entry.patch.writer, entry.sha, index);
      if (!this.#collectNode(op, event)) {
        this.#collectEdge(op, event);
      }
    });
  }

  /** The effects of `entry`, whose patch also observed `implicit` when it is a strand patch. */
  static of(entry: PatchEntry, implicit: ReadonlyMap<string, number>): ConeConcurrencyFold {
    return new ConeConcurrencyFold(entry, implicit);
  }

  node(record: ConeNodeRecord): ConeNodeRecord {
    const effect = this.#nodes.of(record.nodeId);
    return effect === null ? record : record.withConcurrency(this.#applied(record.concurrency, effect));
  }

  edge(record: ConeEdgeRecord): ConeEdgeRecord {
    const effect = this.#edges.of(record.edgeKey);
    return effect === null ? record : record.withConcurrency(this.#applied(record.concurrency, effect));
  }

  #applied(concurrency: ConeConcurrency, effect: ConeElementEffect): ConeConcurrency {
    let next = concurrency;
    for (const [key, write] of effect.writes) {
      next = next.withRegisterWrite(key, write, this.#observation);
    }
    return effect.lifecycle === null ? next : next.withLifecycleEvent(effect.lifecycle, this.#observation);
  }

  #collectNode(op: PatchOp, event: EventId): boolean {
    if (op instanceof NodeAdd) {
      this.#nodes.lifecycle(op.node, { event, role: 'edit' });
    } else if (op instanceof NodeRemove) {
      this.#nodes.remove(op.node, { event, observedDots: op.observedDots });
    } else if (isNodeProperty(op)) {
      this.#nodes.write(op.node, { op, event });
    } else {
      return false;
    }
    return true;
  }

  #collectEdge(op: PatchOp, event: EventId): void {
    if (op instanceof EdgeAdd) {
      this.#edges.lifecycle(encodeEdgeKey(op.from, op.to, op.label), { event, role: 'edit' });
    } else if (op instanceof EdgeRemove) {
      this.#edges.remove(encodeEdgeKey(op.from, op.to, op.label), { event, observedDots: op.observedDots });
    } else if (op instanceof EdgePropSet) {
      this.#edges.write(encodeEdgeKey(op.from, op.to, op.label), { op, event });
    } else if (op instanceof PropSet) {
      const { from, to, label } = decodeLegacyEdgePropNode(op.node);
      this.#edges.write(encodeEdgeKey(from, to, label), { op, event });
    }
  }
}

/** A node property write: canonical, or a legacy `PropSet` whose node is not an edge-property node. */
function isNodeProperty(op: PatchOp): op is NodePropSet | PropSet {
  return op instanceof NodePropSet || (op instanceof PropSet && !isLegacyEdgePropNode(op.node));
}
