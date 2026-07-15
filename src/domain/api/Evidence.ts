import type Tick from './Tick.ts';
import type RetentionEvidence from './RetentionEvidence.ts';

/** Opaque, storage-neutral handle for one item of causal support. */
export type EvidenceHandle = Readonly<{
  readonly id: string;
}>;

/** Public causal evidence without substrate object identities. */
export type Evidence = Readonly<{
  readonly basis: EvidenceHandle;
  readonly support: readonly EvidenceHandle[];
  readonly retention?: readonly RetentionEvidence[];
  readonly tick?: Tick;
}>;

export default Evidence;
