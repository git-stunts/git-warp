import type RefPort from '../../ports/RefPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import { Dot } from '../crdt/Dot.ts';
import ORSet from '../crdt/ORSet.ts';
import VersionVector from '../crdt/VersionVector.ts';
import PatchError from '../errors/PatchError.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import NodeRemove from '../types/ops/NodeRemove.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import PropSet from '../types/ops/PropSet.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import { buildWritersPrefix, parseWriterIdFromRef } from '../utils/RefLayout.ts';
import { graphFrontierCoordinateRef } from './admission/GraphCoordinateRef.ts';
import { decodeEdgeKey, encodeEdgeKey } from './KeyCodec.ts';
import NodeRemovalObservation from './NodeRemovalObservation.ts';
import type ObservedWriteFrontier from '../types/ObservedWriteFrontier.ts';

export const MAX_REMOVAL_BASIS_WRITERS = 1024;
export const MAX_REMOVAL_BASIS_PATCHES = 10_000;
export const MAX_REMOVAL_BASIS_OPERATIONS = 50_000;
export const MAX_REMOVAL_BASIS_MEMBERS = 50_000;
export const MAX_REMOVAL_BASIS_TEXT_UNITS = 8 * 1024 * 1024;

/** Bounded journal observation; retains membership dots and property names, never values. */
export default class BoundedNodeRemovalBasis {
  readonly #nodes = ORSet.empty();
  readonly #edges = ORSet.empty();
  readonly #properties = new Map<string, Set<string>>();
  readonly #targets: ReadonlySet<string>;
  #context = VersionVector.empty();
  #lamport = 0;
  #members = 0;
  #textUnits = 0;
  readonly coordinateRef: string;

  private constructor(targets: ReadonlySet<string>, coordinateRef: string) {
    for (const target of targets) { this.#chargeText(target); }
    this.#targets = new Set(targets);
    this.coordinateRef = coordinateRef;
    Object.freeze(this);
  }

  static async capture(fields: {
    readonly refs: RefPort;
    readonly journal: PatchJournalPort;
    readonly graphName: string;
    readonly writerId: string;
    readonly expectedParentSha: string | null;
    readonly targets: ReadonlySet<string>;
    readonly observation?: ObservedWriteFrontier | undefined;
  }): Promise<BoundedNodeRemovalBasis> {
    const frontier = fields.observation === undefined
      ? await captureFrontier(fields) : fields.observation.frontier();
    if (frontier.size > MAX_REMOVAL_BASIS_WRITERS) { throw budgetExceeded(); }
    if (fields.expectedParentSha === null) { frontier.delete(fields.writerId); }
    else { frontier.set(fields.writerId, fields.expectedParentSha); }
    const basis = new BoundedNodeRemovalBasis(fields.targets, graphFrontierCoordinateRef(fields.graphName, frontier));
    await basis.#replay(fields.journal, frontier);
    return basis;
  }

  get lamport(): number { return this.#lamport; }
  context(): VersionVector { return this.#context.clone(); }

  containsNode(nodeId: string): boolean {
    return this.#targets.has(nodeId) && this.#nodes.contains(nodeId);
  }

  containsEdge(from: string, to: string, label: string): boolean {
    return (this.#targets.has(from) || this.#targets.has(to))
      && this.#edges.contains(encodeEdgeKey(from, to, label));
  }

  node(nodeId: string): NodeRemovalObservation {
    if (!this.#targets.has(nodeId)) {throw budgetExceeded();}
    const edges = this.#edges.elements().filter((key) => {
      const edge = decodeEdgeKey(key);
      return edge.from === nodeId || edge.to === nodeId;
    });
    return new NodeRemovalObservation(
      new NodeRemove(nodeId, [...this.#nodes.getDots(nodeId)].sort()),
      edges.sort().map((key) => new EdgeRemove({ ...decodeEdgeKey(key), observedDots: [...this.#edges.getDots(key)].sort() })),
      this.#properties.get(nodeId)?.size ?? 0,
    );
  }

  async #replay(journal: PatchJournalPort, frontier: ReadonlyMap<string, string>): Promise<void> {
    let patchCount = 0;
    let operationCount = 0;
    for (const [writer, sha] of frontier) {
      for await (const entry of journal.scanPatchHistory(writer, sha)) {
        patchCount++;
        operationCount += entry.patch.ops.length;
        requireReplayBounds(patchCount, operationCount);
        this.#lamport = Math.max(this.#lamport, entry.patch.lamport);
        const context = VersionVector.from(entry.patch.context);
        for (const [writerId] of context) { this.#chargeText(writerId); }
        this.#context = this.#context.merge(context);
        for (const op of entry.patch.ops) { this.#observe(op); }
      }
    }
  }

  #observe(op: PatchOp): void {
    if (op instanceof NodeAdd || op instanceof EdgeAdd) {
      this.#context.set(op.dot.writerId, Math.max(this.#context.get(op.dot.writerId) ?? 0, op.dot.counter));
    }
    this.#observeMembership(op);
    this.#observePropertyName(op);
  }

  #observeMembership(op: PatchOp): void {
    if (op instanceof NodeAdd) {
      if (this.#targets.has(op.node)) {
        this.#chargeText(op.node, Dot.encode(op.dot));
        this.#nodes.add(op.node, op.dot);
      }
    } else if (op instanceof NodeRemove) {
      this.#nodes.remove(this.#removedDots(op.observedDots));
    } else {
      this.#observeEdge(op);
    }
  }

  #observeEdge(op: PatchOp): void {
    if (op instanceof EdgeAdd && (this.#targets.has(op.from) || this.#targets.has(op.to))) {
      this.#chargeText(op.from, op.to, op.label, Dot.encode(op.dot));
      this.#edges.add(encodeEdgeKey(op.from, op.to, op.label), op.dot);
    } else if (op instanceof EdgeRemove) {
      this.#edges.remove(this.#removedDots(op.observedDots));
    }
  }

  #removedDots(dots: readonly string[]): Set<string> {
    for (const dot of dots) { this.#chargeText(dot); }
    return new Set(dots);
  }

  #chargeText(...values: readonly string[]): void {
    for (const value of values) {
      this.#members++;
      this.#textUnits += value.length;
    }
    if (this.#members > MAX_REMOVAL_BASIS_MEMBERS || this.#textUnits > MAX_REMOVAL_BASIS_TEXT_UNITS) {
      throw budgetExceeded();
    }
  }

  #observePropertyName(op: PatchOp): void {
    if ((op instanceof PropSet || op instanceof NodePropSet) && this.#targets.has(op.node)) {
      this.#chargeText(op.node, op.key);
      const keys = this.#properties.get(op.node) ?? new Set<string>();
      keys.add(op.key);
      this.#properties.set(op.node, keys);
    }
  }
}

async function captureFrontier(fields: {
  readonly refs: RefPort;
  readonly graphName: string;
  readonly writerId: string;
  readonly expectedParentSha: string | null;
}): Promise<Map<string, string>> {
  const frontier = new Map<string, string>();
  const refs = await fields.refs.listRefs(buildWritersPrefix(fields.graphName), { limit: MAX_REMOVAL_BASIS_WRITERS + 1 });
  if (refs.length > MAX_REMOVAL_BASIS_WRITERS) { throw budgetExceeded(); }
  for (const ref of refs.sort()) {
    const writer = parseWriterIdFromRef(ref);
    const sha = await fields.refs.readRef(ref);
    if (writer !== null && sha !== null) { frontier.set(writer, sha); }
  }
  // Our immutable parent is the CAS basis; foreign additions after capture
  // remain concurrent and must survive this removal.
  return frontier;
}

function budgetExceeded(): PatchError {
  return new PatchError('Removal observation exceeds the bounded journal profile', { code: 'E_PATCH_NO_STATE' });
}

function requireReplayBounds(patches: number, operations: number): void {
  if (patches > MAX_REMOVAL_BASIS_PATCHES || operations > MAX_REMOVAL_BASIS_OPERATIONS) { throw budgetExceeded(); }
}
