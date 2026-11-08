import type ConeRecordStorePort from '../../ports/ConeRecordStorePort.ts';
import type ConeBasis from '../services/cone/ConeBasis.ts';
import type ConeBasisHead from '../services/cone/ConeBasisHead.ts';
import OrdinalGeometry from './OrdinalGeometry.ts';
import RetainedGraphManifest from './RetainedGraphManifest.ts';

/**
 * Opens retained graph manifests from the cone record store (#815): the live
 * basis under a head, or the bases a lane retains as checkpoints. Opening
 * reads the basis bundle only; no record is read and nothing is copied.
 */
export default class RetainedGraphManifestReader {
  readonly #store: ConeRecordStorePort;
  readonly #geometry: OrdinalGeometry;

  constructor(options: { readonly store: ConeRecordStorePort; readonly geometry?: OrdinalGeometry }) {
    this.#store = options.store;
    this.#geometry = options.geometry ?? OrdinalGeometry.dotPages();
  }

  /** The manifest of the basis published under `head`, or null when the clone has none. */
  async open(head: ConeBasisHead): Promise<RetainedGraphManifest | null> {
    const stored = await this.#store.readBasis(head);
    return stored === null ? null : this.#manifestOf(stored.basis);
  }

  /** The manifests of the bases `lane` retains, oldest first. */
  async retained(lane: string): Promise<readonly RetainedGraphManifest[]> {
    return (await this.#store.readRetainedBases(lane)).map((stored) => this.#manifestOf(stored.basis));
  }

  #manifestOf(basis: ConeBasis): RetainedGraphManifest {
    return new RetainedGraphManifest({ layout: this.#store.recordLayout(), geometry: this.#geometry, basis });
  }
}
