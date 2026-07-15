import WarpError from '../errors/WarpError.ts';
import type {
  StorageReachability,
  StorageRetentionPolicy,
  StorageRetentionRootKind,
} from '../storage/StorageRetentionWitness.ts';
import type { EvidenceHandle } from './Evidence.ts';

export type RetentionEvidenceOptions = Readonly<{
  witness: EvidenceHandle;
  policy: StorageRetentionPolicy;
  reachability: StorageReachability;
  rootKind: StorageRetentionRootKind;
}>;

/** Public, storage-neutral projection of a concrete retention witness. */
export default class RetentionEvidence {
  readonly witness: EvidenceHandle;
  readonly policy: StorageRetentionPolicy;
  readonly reachability: StorageReachability;
  readonly rootKind: StorageRetentionRootKind;

  constructor(options: RetentionEvidenceOptions) {
    requireOptions(options);
    this.witness = freezeWitness(options.witness);
    this.policy = requirePolicy(options.policy);
    this.reachability = requireReachability(options.reachability);
    this.rootKind = requireRootKind(options.rootKind);
    Object.freeze(this);
  }
}

function requireOptions(options: RetentionEvidenceOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw evidenceError('options must be an object');
  }
}

function freezeWitness(witness: EvidenceHandle): EvidenceHandle {
  if (witness === null || typeof witness !== 'object') {
    throw evidenceError('witness must be an evidence handle');
  }
  if (typeof witness.id !== 'string' || witness.id.length === 0) {
    throw evidenceError('witness.id must be non-empty');
  }
  return Object.freeze({ id: witness.id });
}

function requirePolicy(policy: StorageRetentionPolicy): StorageRetentionPolicy {
  if (policy !== 'pinned' && policy !== 'evictable') {
    throw evidenceError('policy is invalid');
  }
  return policy;
}

function requireReachability(reachability: StorageReachability): StorageReachability {
  if (reachability !== 'anchored' && reachability !== 'orphaned' && reachability !== 'volatile') {
    throw evidenceError('reachability is invalid');
  }
  return reachability;
}

function requireRootKind(rootKind: StorageRetentionRootKind): StorageRetentionRootKind {
  if (rootKind !== 'root-set'
    && rootKind !== 'publication'
    && rootKind !== 'cache-set'
    && rootKind !== 'expiring-set') {
    throw evidenceError('rootKind is invalid');
  }
  return rootKind;
}

function evidenceError(message: string): WarpError {
  return new WarpError(`Retention evidence ${message}`, 'E_RECEIPT_EVIDENCE');
}
