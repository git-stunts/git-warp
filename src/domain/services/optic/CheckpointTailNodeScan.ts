import { encodeDot } from '../../crdt/Dot.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import { EventId } from '../../utils/EventId.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';
import {
  copyNodeLifecycle,
  emptyNodeLifecycle,
  recordNodeAdd,
  recordNodeRemove,
  type NodeLifecycleEvents,
  type NodeLifecycleSource,
} from '../state/NodeLifecycle.ts';
import type { CheckpointTailPatchEntry } from './CheckpointTailOpticSource.ts';

/** How liveness stands after the tail: known, or dependent on dots the checkpoint does not show. */
export type TailNodeLiveness = 'alive' | 'dead' | 'undecided';

/**
 * What the tail does to one node's lifecycle: its adds and removes, in the
 * order they arrive, and the dots they add and remove.
 */
export default class CheckpointTailNodeScan {
  readonly #adds: readonly EventId[];
  readonly #removes: readonly EventId[];
  readonly #addedDots: ReadonlySet<string>;
  readonly #removedDots: ReadonlySet<string>;

  private constructor(fields: {
    readonly adds: readonly EventId[];
    readonly removes: readonly EventId[];
    readonly addedDots: ReadonlySet<string>;
    readonly removedDots: ReadonlySet<string>;
  }) {
    this.#adds = fields.adds;
    this.#removes = fields.removes;
    this.#addedDots = fields.addedDots;
    this.#removedDots = fields.removedDots;
    Object.freeze(this);
  }

  /** Scans every add of the node and every remove that observed one of its dots. */
  static scan(entries: readonly CheckpointTailPatchEntry[], nodeId: string): CheckpointTailNodeScan {
    const adds: EventId[] = [];
    const removes: EventId[] = [];
    const addedDots = new Set<string>();
    const removedDots = new Set<string>();
    for (const entry of entries) {
      entry.patch.ops.forEach((rawOp, opIndex) => {
        const op = normalizeRawOp(rawOp);
        const eventId = new EventId(entry.patch.lamport, entry.patch.writer, entry.sha, opIndex);
        if (isNodeAdd(op, nodeId)) {
          adds.push(eventId);
          addedDots.add(encodeDot(op.dot));
        } else if (isObservedNodeRemove(op, nodeId)) {
          removes.push(eventId);
          op.observedDots.forEach((dot) => removedDots.add(dot));
        }
      });
    }
    return new CheckpointTailNodeScan({ adds, removes, addedDots, removedDots });
  }

  hasAdd(): boolean {
    return this.#adds.length > 0;
  }

  touchesLifecycle(): boolean {
    return this.#adds.length > 0 || this.#removes.length > 0;
  }

  /** The checkpoint's lifecycle records, or none, with every tail add and remove recorded on top. */
  lifecycleAfter(checkpoint: NodeLifecycleSource | null, nodeId: string): NodeLifecycleEvents {
    const lifecycle = checkpoint === null ? emptyNodeLifecycle() : copyNodeLifecycle(checkpoint);
    this.#adds.forEach((add) => recordNodeAdd(lifecycle, nodeId, add));
    this.#removes.forEach((removal) => recordNodeRemove(lifecycle, nodeId, removal));
    return lifecycle;
  }

  /**
   * Liveness after the tail. A tail add whose dot no tail remove observed
   * keeps the node live. Without one, a tail remove may or may not have
   * observed every live dot of the checkpoint, which only the checkpoint's
   * dots decide, unless the node was not live there.
   */
  livenessAfter(checkpointAlive: boolean): TailNodeLiveness {
    if ([...this.#addedDots].some((dot) => !this.#removedDots.has(dot))) {
      return 'alive';
    }
    if (this.#removes.length === 0 || !checkpointAlive) {
      return checkpointAlive ? 'alive' : 'dead';
    }
    return 'undecided';
  }
}

type NormalizedOperation = ReturnType<typeof normalizeRawOp>;

function isNodeAdd(op: NormalizedOperation, nodeId: string): op is NodeAdd {
  return op instanceof NodeAdd && op.node === nodeId;
}

/** A remove that observed none of the node's dots removes nothing and records nothing. */
function isObservedNodeRemove(op: NormalizedOperation, nodeId: string): op is NodeRemove {
  return op instanceof NodeRemove && op.node === nodeId && op.observedDots.length > 0;
}
