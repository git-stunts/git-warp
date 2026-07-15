import type Tick from './Tick.ts';
import type {
  StorageReachability,
  StorageRetentionPolicy,
  StorageRetentionRootKind,
} from '../storage/StorageRetentionWitness.ts';

/** Opaque, storage-neutral handle for one item of causal support. */
export type EvidenceHandle = Readonly<{
  readonly id: string;
}>;

/** Public, storage-neutral projection of a concrete retention witness. */
export type RetentionEvidence = Readonly<{
  readonly witness: EvidenceHandle;
  readonly policy: StorageRetentionPolicy;
  readonly reachability: StorageReachability;
  readonly rootKind: StorageRetentionRootKind;
}>;

/** Public causal evidence without substrate object identities. */
export type Evidence = Readonly<{
  readonly basis: EvidenceHandle;
  readonly support: readonly EvidenceHandle[];
  readonly retention?: readonly RetentionEvidence[];
  readonly tick?: Tick;
}>;

export default Evidence;
