import type { RetentionWitnessData } from '@git-stunts/git-cas';
import StorageHandle from '../../domain/storage/StorageHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../domain/storage/StorageRetentionWitness.ts';

/** Converts git-cas retention evidence into runtime-backed domain evidence. */
export function adaptGitCasRetentionWitness(
  witness: RetentionWitnessData,
): StorageRetentionWitness {
  return new StorageRetentionWitness({
    handle: new StorageHandle(witness.handle),
    policy: witness.policy,
    reachability: witness.reachability,
    root: new StorageRetentionRoot({
      kind: witness.root.kind,
      namespace: witness.root.namespace,
      locator: witness.root.ref,
      generation: witness.root.generation,
      path: witness.root.path,
    }),
    observedAt: witness.observedAt,
  });
}
