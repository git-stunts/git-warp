import { LWWRegister } from '../../crdt/LWW.ts';
import QueryError from '../../errors/QueryError.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { EventId } from '../../utils/EventId.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';
import {
  copyNodeLifecycle,
  emptyNodeLifecycle,
  isStaleNodeRegisterIn,
  recordNodeAdd,
  recordNodeRemove,
  type NodeLifecycleEvents,
  type NodeLifecycleSource,
} from '../state/NodeLifecycle.ts';
import type { CheckpointTailPatchEntry } from './CheckpointTailOpticSource.ts';

/**
 * What the read knows about the node's lifecycle at the checkpoint.
 * `witnessed` carries the checkpoint's node lifecycle records and the
 * EventId of the register behind the checkpoint value. `unwitnessed` means
 * the basis carries neither, and a read whose answer depends on them is
 * refused.
 */
export type CheckpointNodeLifecycle =
  | {
    readonly kind: 'witnessed';
    readonly lifecycle: NodeLifecycleSource;
    readonly baseRegisterEvent: EventId | null;
  }
  | { readonly kind: 'unwitnessed' };

type NormalizedTailOperation = ReturnType<typeof normalizeRawOp>;
type NeighborhoodTailScope = {
  readonly direction: 'in' | 'out' | 'both';
  readonly labels: readonly string[];
};

export default class CheckpointTailFactReducer {
  private readonly _graphName: string;

  constructor(options: { readonly graphName: string }) {
    this._graphName = options.graphName;
    Object.freeze(this);
  }

  includesNodeLiveness(entry: CheckpointTailPatchEntry, nodeId: string): boolean {
    return entry.patch.ops.some((rawOp) => {
      const op = normalizeRawOp(rawOp);
      return (op instanceof NodeAdd || op instanceof NodeRemove)
        && op.node === nodeId;
    });
  }

  includesProperty(
    entry: CheckpointTailPatchEntry,
    nodeId: string,
    propertyKey: string,
  ): boolean {
    return entry.patch.ops.some((rawOp) => {
      const op = normalizeRawOp(rawOp);
      return isTargetPropertyOp(op, nodeId, propertyKey) || isTargetLifecycleOp(op, nodeId);
    });
  }

  includesNeighborhood(
    entry: CheckpointTailPatchEntry,
    options: NeighborhoodTailScope & { readonly nodeId: string },
  ): boolean {
    return entry.patch.ops.some((rawOp) => (
      neighborhoodNodeIdsForOperation(normalizeRawOp(rawOp), options).includes(options.nodeId)
    ));
  }

  neighborhoodNodeIds(
    entry: CheckpointTailPatchEntry,
    options: NeighborhoodTailScope,
  ): readonly string[] {
    const nodeIds = new Set<string>();
    for (const rawOp of entry.patch.ops) {
      for (const nodeId of neighborhoodNodeIdsForOperation(normalizeRawOp(rawOp), options)) {
        nodeIds.add(nodeId);
      }
    }
    return Object.freeze([...nodeIds].sort());
  }

  reduceNodeLiveness(
    baseAlive: boolean,
    tailEntries: readonly CheckpointTailPatchEntry[],
    nodeId: string,
  ): boolean {
    let alive = baseAlive;
    for (const entry of tailEntries) {
      alive = this._reduceNodeLivenessEntry(alive, entry, nodeId);
    }
    return alive;
  }

  reduceProperty(options: {
    readonly baseValue: PropValue | undefined;
    readonly checkpointLifecycle: CheckpointNodeLifecycle;
    readonly tailEntries: readonly CheckpointTailPatchEntry[];
    readonly nodeId: string;
    readonly propertyKey: string;
  }): PropValue | undefined {
    const tailRegister = this._tailPropertyRegister(options);
    const lifecycle = tailNodeLifecycle(options);
    if (tailRegister !== null) {
      return isStaleNodeRegisterIn(lifecycle, options.nodeId, tailRegister.eventId) ? undefined : tailRegister.value;
    }
    if (options.baseValue === undefined) {
      return undefined;
    }
    return this._isCheckpointValueHidden(options, lifecycle) ? undefined : options.baseValue;
  }

  /**
   * Tail events sort after every checkpointed register and after the node's
   * checkpointed add, so a tail remove followed by a later tail add hides the
   * checkpoint value. A tail add alone can also pass a remove the checkpoint
   * holds as pending and hide the value; only the checkpoint's lifecycle
   * records can say whether one exists.
   */
  private _isCheckpointValueHidden(
    options: {
      readonly checkpointLifecycle: CheckpointNodeLifecycle;
      readonly nodeId: string;
    },
    lifecycle: NodeLifecycleEvents,
  ): boolean {
    const { checkpointLifecycle, nodeId } = options;
    if (checkpointLifecycle.kind === 'witnessed') {
      return isStaleNodeRegisterIn(lifecycle, nodeId, checkpointLifecycle.baseRegisterEvent);
    }
    if (lifecycle.nodeClearEvent.has(nodeId)) {
      return true;
    }
    if (lifecycle.nodeBirthEvent.has(nodeId)) {
      throwNoBoundedBasis(this._graphName, 'tail-node-add-needs-checkpoint-lifecycle-witnesses');
    }
    return false;
  }

  assertNeighborhoodTailStable(
    tailEntries: readonly CheckpointTailPatchEntry[],
  ): void {
    if (tailEntries.length > 0) {
      throwNoBoundedBasis(this._graphName, 'tail-neighborhood-needs-adjacency-witnesses');
    }
  }

  private _reduceNodeLivenessEntry(
    currentAlive: boolean,
    entry: CheckpointTailPatchEntry,
    nodeId: string,
  ): boolean {
    let alive = currentAlive;
    for (const rawOp of entry.patch.ops) {
      alive = this._reduceNodeLivenessOp(alive, normalizeRawOp(rawOp), nodeId);
    }
    return alive;
  }

  private _reduceNodeLivenessOp(
    currentAlive: boolean,
    op: NormalizedTailOperation,
    nodeId: string,
  ): boolean {
    if (isTargetNodeAdd(op, nodeId)) {
      return true;
    }
    if (isTargetNodeRemove(op, nodeId)) {
      throwNoBoundedBasis(this._graphName, 'tail-node-remove-needs-raw-liveness-witnesses');
    }
    return currentAlive;
  }

  private _tailPropertyRegister(options: {
    readonly tailEntries: readonly CheckpointTailPatchEntry[];
    readonly nodeId: string;
    readonly propertyKey: string;
  }): LWWRegister<PropValue> | null {
    let tailRegister: LWWRegister<PropValue> | null = null;
    for (const entry of options.tailEntries) {
      tailRegister = this._addTailPropertyEntryRegister(tailRegister, entry, options);
    }
    return tailRegister;
  }

  private _addTailPropertyEntryRegister(
    current: LWWRegister<PropValue> | null,
    entry: CheckpointTailPatchEntry,
    options: {
      readonly nodeId: string;
      readonly propertyKey: string;
    },
  ): LWWRegister<PropValue> | null {
    let tailRegister = current;
    for (let opIndex = 0; opIndex < entry.patch.ops.length; opIndex += 1) {
      const rawOp = entry.patch.ops[opIndex];
      if (rawOp !== undefined) {
        tailRegister = this._addTailPropertyOperationRegister({
          current: tailRegister,
          entry,
          nodeId: options.nodeId,
          op: normalizeRawOp(rawOp),
          opIndex,
          propertyKey: options.propertyKey,
        });
      }
    }
    return tailRegister;
  }

  private _addTailPropertyOperationRegister(options: {
    readonly current: LWWRegister<PropValue> | null;
    readonly entry: CheckpointTailPatchEntry;
    readonly nodeId: string;
    readonly op: NormalizedTailOperation;
    readonly opIndex: number;
    readonly propertyKey: string;
  }): LWWRegister<PropValue> | null {
    if (!isTargetPropertyOp(options.op, options.nodeId, options.propertyKey)) {
      return options.current;
    }
    return LWWRegister.max(
      options.current,
      new LWWRegister(
        new EventId(
          options.entry.patch.lamport,
          options.entry.patch.writer,
          options.entry.sha,
          options.opIndex,
        ),
        readScalarTailPropertyValue(options.op, this._graphName),
      ),
    );
  }
}

function isTargetPropertyOp(
  op: NormalizedTailOperation,
  nodeId: string,
  propertyKey: string,
): op is NodePropSet {
  return op instanceof NodePropSet && op.node === nodeId && op.key === propertyKey;
}

/** An add of the node, or a remove that observed at least one of its dots. */
function isTargetLifecycleOp(op: NormalizedTailOperation, nodeId: string): op is NodeAdd | NodeRemove {
  return isTargetNodeAdd(op, nodeId)
    || (isTargetNodeRemove(op, nodeId) && op.observedDots.length > 0);
}

/**
 * The node's lifecycle records after the tail: the checkpoint's records when
 * they are witnessed, then each add and remove of the node in the tail.
 */
function tailNodeLifecycle(options: {
  readonly checkpointLifecycle: CheckpointNodeLifecycle;
  readonly tailEntries: readonly CheckpointTailPatchEntry[];
  readonly nodeId: string;
}): NodeLifecycleEvents {
  const { checkpointLifecycle, nodeId, tailEntries } = options;
  const lifecycle = checkpointLifecycle.kind === 'witnessed'
    ? copyNodeLifecycle(checkpointLifecycle.lifecycle)
    : emptyNodeLifecycle();
  for (const entry of tailEntries) {
    entry.patch.ops.forEach((rawOp, opIndex) => {
      const op = normalizeRawOp(rawOp);
      if (isTargetLifecycleOp(op, nodeId)) {
        const eventId = new EventId(entry.patch.lamport, entry.patch.writer, entry.sha, opIndex);
        const record = op instanceof NodeAdd ? recordNodeAdd : recordNodeRemove;
        record(lifecycle, nodeId, eventId);
      }
    });
  }
  return lifecycle;
}

function isTargetNodeAdd(
  op: NormalizedTailOperation,
  nodeId: string,
): op is NodeAdd {
  return op instanceof NodeAdd && op.node === nodeId;
}

function isTargetNodeRemove(
  op: NormalizedTailOperation,
  nodeId: string,
): op is NodeRemove {
  return op instanceof NodeRemove && op.node === nodeId;
}

function matchesNeighborhoodLabel(
  op: EdgeAdd | EdgeRemove,
  labels: readonly string[],
): boolean {
  return labels.length === 0 || labels.includes(op.label);
}

function neighborhoodNodeIdsForOperation(
  op: NormalizedTailOperation,
  options: NeighborhoodTailScope,
): readonly string[] {
  if (!isEdgeMutation(op) || !matchesNeighborhoodLabel(op, options.labels)) {
    return [];
  }
  const byDirection: Readonly<Record<NeighborhoodTailScope['direction'], readonly string[]>> = {
    in: [op.to],
    out: [op.from],
    both: op.from === op.to ? [op.from] : [op.from, op.to],
  };
  return byDirection[options.direction];
}

function isEdgeMutation(op: NormalizedTailOperation): op is EdgeAdd | EdgeRemove {
  return op instanceof EdgeAdd || op instanceof EdgeRemove;
}

function readScalarTailPropertyValue(
  op: NodePropSet,
  graphName: string,
): PropValue {
  const { value } = op;
  if (isPrimitiveTailPropertyValue(value) || value instanceof Uint8Array) {
    return value;
  }
  return throwNoBoundedBasis(graphName, 'tail-property-value-needs-parser');
}

function isPrimitiveTailPropertyValue(
  value: NodePropSet['value'],
): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function throwNoBoundedBasis(graphName: string, reason: string): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}
