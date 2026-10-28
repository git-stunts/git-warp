import MintId from '../../crdt/MintId.ts';
import StrandError from '../../errors/StrandError.ts';
import ConeTipSource from '../cone/ConeTipSource.ts';
import type StrandDescriptorStore from './StrandDescriptorStore.ts';

/**
 * The tips a strand's cone basis folds to (#1039): the strand's base
 * frontier, the head of each of its writer chains, and the pinned head of
 * each read overlay braided into it. It reads the descriptor and the chain
 * head refs; it never walks a chain.
 */
export default class StrandConeTips extends ConeTipSource {
  readonly #descriptors: StrandDescriptorStore;
  readonly #strandId: string;

  constructor(descriptors: StrandDescriptorStore, strandId: string) {
    super();
    this.#descriptors = descriptors;
    this.#strandId = strandId;
    Object.freeze(this);
  }

  override async tips(): Promise<ReadonlyMap<string, string>> {
    const descriptor = await this.#descriptors.readUnhydratedDescriptor(this.#strandId);
    if (descriptor === null) {
      throw new StrandError(`Strand '${this.#strandId}' not found`, {
        code: 'E_STRAND_NOT_FOUND', context: { strandId: this.#strandId },
      });
    }
    const tips = new Map(Object.entries(descriptor.baseObservation.frontier));
    for (const overlay of descriptor.braid.readOverlays) {
      if (overlay.headPatchSha !== null) { tips.set(overlay.overlayId, overlay.headPatchSha); }
    }
    for (const [writerId, headPatchSha] of await this.#descriptors.listWriterHeads(this.#strandId)) {
      tips.set(MintId.strand(writerId, this.#strandId).encode(), headPatchSha);
    }
    return tips;
  }
}
