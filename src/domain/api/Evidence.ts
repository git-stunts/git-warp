import type Tick from './Tick.ts';

/** Opaque, storage-neutral handle for one item of causal support. */
export type EvidenceHandle = Readonly<{
  readonly id: string;
}>;

/** Public causal evidence without substrate object identities. */
type Evidence = Readonly<{
  readonly basis: EvidenceHandle;
  readonly support: readonly EvidenceHandle[];
  readonly tick?: Tick;
}>;

export default Evidence;
