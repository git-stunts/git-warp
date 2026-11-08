import { Dot } from '../crdt/Dot.ts';
import type ConeRecordStorePort from '../../ports/ConeRecordStorePort.ts';
import ConeRecordKey, { type ConeDotSet } from '../services/cone/ConeRecordKey.ts';
import { compareStrings } from '../utils/StringComparison.ts';
import GraphOrdinal from './GraphOrdinal.ts';
import type RetainedGraphManifest from './RetainedGraphManifest.ts';

/**
 * Maps an element identifier to its graph-local ordinals under a retained
 * manifest (#815): every dot that added the element, live or tombstoned, in
 * writer-then-counter order. The mapping reads the element's one record and
 * depends only on the patch set, never on fold order. The reverse direction
 * is {@link OrdinalAddressResolver}.
 */
export default class IdentifierDictionary {
  readonly #store: ConeRecordStorePort;

  constructor(store: ConeRecordStorePort) {
    this.#store = store;
  }

  async ordinalsOf(manifest: RetainedGraphManifest, kind: ConeDotSet, identifier: string): Promise<readonly GraphOrdinal[]> {
    const key = kind === 'node' ? ConeRecordKey.forNode(identifier) : ConeRecordKey.forEdge(identifier);
    const snapshot = await this.#store.readRecords(manifest.basis.root, [key]);
    const record = kind === 'node' ? snapshot.node(identifier) : snapshot.edge(identifier);
    return [...record.addDots].map((encoded) => GraphOrdinal.fromDot(kind, Dot.decode(encoded))).sort(compareOrdinals);
  }
}

function compareOrdinals(left: GraphOrdinal, right: GraphOrdinal): number {
  return compareStrings(left.writerId, right.writerId) || left.counter - right.counter;
}
