import type { OpticReadFailureCauseValue } from './OpticReadFailureCause.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import QueryError from '../../errors/QueryError.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { compareEventIds, EventId } from '../../utils/EventId.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';
import { isStaleNodeRegisterIn, type NodeLifecycleSource } from '../state/NodeLifecycle.ts';
import CheckpointTailNodeScan from './CheckpointTailNodeScan.ts';
import type { CheckpointTailPatchEntry } from './CheckpointTailOpticSource.ts';

/**
 * What the read knows about the node at the checkpoint. `lifecycle` holds
 * the checkpoint's node lifecycle records, `baseRegisterEvent` the EventId
 * of the node's register for the key when it is not stale (whether or not
 * the node is live), `baseAlive` whether the node is live, and
 * `floatingTombstones` the encoded node dots the checkpoint's removes
 * observed although no checkpoint add holds them.
 */
export type WitnessedCheckpointNodeLifecycle = {
  readonly kind: 'witnessed';
  readonly lifecycle: NodeLifecycleSource;
  readonly baseRegisterEvent: EventId | null;
  readonly baseAlive: boolean;
  readonly floatingTombstones: ReadonlySet<string>;
};

/**
 * `unwitnessed` means the basis carries no lifecycle records or register
 * EventIds, and a read whose answer depends on them is refused.
 */
export type CheckpointNodeLifecycle =
  | WitnessedCheckpointNodeLifecycle
  | { readonly kind: 'unwitnessed' };

type WinningRegister =
  | { readonly kind: 'checkpoint'; readonly eventId: EventId }
  | { readonly kind: 'tail'; readonly eventId: EventId; readonly value: PropValue };

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
    const tailNode = CheckpointTailNodeScan.scan(options.tailEntries, options.nodeId);
    const { checkpointLifecycle } = options;
    if (checkpointLifecycle.kind === 'unwitnessed') {
      return this._reduceUnwitnessed(options.baseValue, tailRegister, tailNode);
    }
    if (this._livenessAfter(checkpointLifecycle, tailNode) === 'dead') {
      return undefined;
    }
    const lifecycle = tailNode.lifecycleAfter(checkpointLifecycle.lifecycle, options.nodeId);
    const winner = winningRegister(checkpointLifecycle.baseRegisterEvent, tailRegister);
    return winner === null || isStaleNodeRegisterIn(lifecycle, options.nodeId, winner.eventId)
      ? undefined
      : this._visibleValue(winner, options.baseValue);
  }

  private _visibleValue(winner: WinningRegister, baseValue: PropValue | undefined): PropValue {
    return winner.kind === 'tail' ? winner.value : this._checkpointValue(baseValue);
  }

  /**
   * The checkpoint register wins and is visible. Its value is in the
   * property shard unless the node was not live at the checkpoint and a
   * tail add made the register visible again.
   */
  private _checkpointValue(baseValue: PropValue | undefined): PropValue {
    if (baseValue === undefined) {
      throwNoBoundedBasis(this._graphName, 'tail-node-add-needs-checkpoint-lifecycle-witnesses');
    }
    return baseValue;
  }

  /**
   * Without the checkpoint's lifecycle records and register EventIds, any
   * tail write or tail add or remove of the node may sort below a checkpoint
   * event and so have an effect the tail alone cannot see. Only a tail that
   * touches neither leaves the checkpoint value standing.
   */
  private _reduceUnwitnessed(
    baseValue: PropValue | undefined,
    tailRegister: LWWRegister<PropValue> | null,
    tailNode: CheckpointTailNodeScan,
  ): PropValue | undefined {
    if (tailNode.hasAdd()) {
      throwNoBoundedBasis(this._graphName, 'tail-node-add-needs-checkpoint-lifecycle-witnesses');
    }
    if (tailRegister !== null || tailNode.touchesLifecycle()) {
      throwNoBoundedBasis(this._graphName, 'tail-property-needs-checkpoint-lifecycle-witnesses');
    }
    return baseValue;
  }

  private _livenessAfter(
    checkpointLifecycle: WitnessedCheckpointNodeLifecycle,
    tailNode: CheckpointTailNodeScan,
  ): 'alive' | 'dead' {
    const liveness = tailNode.livenessAfter(checkpointLifecycle.baseAlive, checkpointLifecycle.floatingTombstones);
    if (liveness === 'undecided') {
      throwNoBoundedBasis(this._graphName, 'tail-node-remove-needs-raw-liveness-witnesses');
    }
    return liveness;
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

/** The register LWW picks from the checkpoint's register and the tail's writes. */
function winningRegister(
  checkpointEvent: EventId | null,
  tailRegister: LWWRegister<PropValue> | null,
): WinningRegister | null {
  if (checkpointEvent !== null
    && (tailRegister === null || compareEventIds(checkpointEvent, tailRegister.eventId) > 0)) {
    return { kind: 'checkpoint', eventId: checkpointEvent };
  }
  return tailRegister === null
    ? null
    : { kind: 'tail', eventId: tailRegister.eventId, value: tailRegister.value };
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

function throwNoBoundedBasis(graphName: string, reason: OpticReadFailureCauseValue): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}
