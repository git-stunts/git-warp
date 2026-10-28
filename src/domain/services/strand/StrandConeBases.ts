import StrandError from '../../errors/StrandError.ts';
import type ConePatchFeedPort from '../../../ports/ConePatchFeedPort.ts';
import type ConeRecordStorePort from '../../../ports/ConeRecordStorePort.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import ConeBasisHead from '../cone/ConeBasisHead.ts';
import ConeLaneBasis from '../cone/ConeLaneBasis.ts';
import StrandConeBasis from './StrandConeBasis.ts';
import StrandConeTips from './StrandConeTips.ts';
import type StrandDescriptorStore from './StrandDescriptorStore.ts';

/** The runtime fields the strand cone bases read, at call time: the runtime wires them after its strand services. */
export type StrandConeRuntime = {
  readonly _graphName: string;
  readonly _coneRecords: ConeRecordStorePort | null;
  readonly _conePatches: ConePatchFeedPort | null;
};

/**
 * The cone bases of a lane's strands (#1039). Forking pins the lane basis it
 * captured as the strand's base; opening a strand yields that pinned base and
 * the strand's own basis over it; dropping a strand releases both. A strand
 * never reads its base through a checkpoint or a materialization.
 */
export default class StrandConeBases {
  readonly #runtime: StrandConeRuntime;
  readonly #descriptors: StrandDescriptorStore;

  constructor(fields: { readonly runtime: StrandConeRuntime; readonly descriptors: StrandDescriptorStore }) {
    this.#runtime = fields.runtime;
    this.#descriptors = fields.descriptors;
    Object.freeze(this);
  }

  /**
   * Pins `basis` as the strand's base. It is the basis the fork captured, so
   * pinning writes one ref and no records. A strand id is a genesis hash, so
   * an existing pin can only be this strand's own and is kept.
   */
  async pinBase(strandId: string, basis: ConeBasis): Promise<void> {
    await this.#ports().store.publishBasis(ConeBasisHead.forStrandBase(this.#runtime._graphName, strandId), basis, null);
  }

  /** Opens the cone bases of a strand from its stored descriptor; no chain is walked. */
  async open(strandId: string): Promise<StrandConeBasis> {
    const ports = this.#ports();
    const descriptor = await this.#descriptors.readUnhydratedDescriptor(strandId);
    if (descriptor === null) {
      throw new StrandError(`Strand '${strandId}' not found`, { code: 'E_STRAND_NOT_FOUND', context: { strandId } });
    }
    if (descriptor.baseObservation.lamportCeiling !== null) {
      throw new StrandError('A strand read below a Lamport ceiling has no cone basis', {
        code: 'E_STRAND_CONE_CEILING', context: { strandId, lamportCeiling: descriptor.baseObservation.lamportCeiling },
      });
    }
    const baseFrontier = new Map(Object.entries(descriptor.baseObservation.frontier));
    const base = ConeLaneBasis.ofStrandBase({ ...ports, lane: this.#runtime._graphName, strandId, baseFrontier });
    const strand = ConeLaneBasis.ofStrand({ ...ports, strandId, tips: new StrandConeTips(this.#descriptors, strandId), base });
    return new StrandConeBasis({ strandId, base, strand });
  }

  /** Deletes a dropped strand's pinned base and its own basis; storage without cone records holds neither. */
  async release(strandId: string): Promise<void> {
    const store = this.#runtime._coneRecords;
    if (store === null) {
      return;
    }
    await store.dropBasis(ConeBasisHead.forStrand(this.#runtime._graphName, strandId));
    await store.dropBasis(ConeBasisHead.forStrandBase(this.#runtime._graphName, strandId));
  }

  #ports(): { readonly store: ConeRecordStorePort; readonly feed: ConePatchFeedPort } {
    const { _coneRecords: store, _conePatches: feed } = this.#runtime;
    if (store === null || feed === null) {
      throw new StrandError('Strand cone bases need storage that keeps cone records', { code: 'E_STRAND_CONE_UNAVAILABLE' });
    }
    return { store, feed };
  }
}
