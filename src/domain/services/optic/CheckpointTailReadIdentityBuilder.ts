import { EventId, compareEventIds } from '../../utils/EventId.ts';
import type { CheckpointTailIndexBasis } from './CheckpointTailBasisLoader.ts';
import ReadIdentity, {
  type ReadIdentityFrontierEntry,
  type ReadIdentityIndexShard,
  type ReadIdentityTailWitness,
} from './ReadIdentity.ts';

const REDUCER_VERSION = 'checkpoint-tail-locator-v1';
const PROJECTION_VERSION = 'optic-read-v17-foundation-v1';

export default class CheckpointTailReadIdentityBuilder {
  private readonly _worldline: string;

  constructor(options: { readonly worldline: string }) {
    this._worldline = options.worldline;
    Object.freeze(this);
  }

  nodeLiveness(options: {
    readonly basis: CheckpointTailIndexBasis;
    readonly nodeId: string;
    readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
    readonly tailWitnesses: readonly ReadIdentityTailWitness[];
  }): ReadIdentity {
    return this._build({
      basis: options.basis,
      entityAspect: `node:${options.nodeId}:liveness`,
      checkpointIndexShards: options.checkpointIndexShards,
      tailWitnesses: options.tailWitnesses,
    });
  }

  nodeProperty(options: {
    readonly basis: CheckpointTailIndexBasis;
    readonly nodeId: string;
    readonly propertyKey: string;
    readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
    readonly tailWitnesses: readonly ReadIdentityTailWitness[];
  }): ReadIdentity {
    return this._build({
      basis: options.basis,
      entityAspect: `node:${options.nodeId}:prop:${options.propertyKey}`,
      checkpointIndexShards: options.checkpointIndexShards,
      tailWitnesses: options.tailWitnesses,
    });
  }

  neighborhood(options: {
    readonly basis: CheckpointTailIndexBasis;
    readonly nodeId: string;
    readonly direction: string;
    readonly labels: readonly string[];
    readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
    readonly tailWitnesses: readonly ReadIdentityTailWitness[];
  }): ReadIdentity {
    return this._build({
      basis: options.basis,
      entityAspect: `node:${options.nodeId}:neighborhood:${options.direction}:${labelsAspect(options.labels)}`,
      checkpointIndexShards: options.checkpointIndexShards,
      tailWitnesses: options.tailWitnesses,
    });
  }

  private _build(options: {
    readonly basis: CheckpointTailIndexBasis;
    readonly entityAspect: string;
    readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
    readonly tailWitnesses: readonly ReadIdentityTailWitness[];
  }): ReadIdentity {
    return new ReadIdentity({
      worldline: this._worldline,
      entityAspect: options.entityAspect,
      checkpointSha: options.basis.checkpointSha,
      checkpointFrontier: frontierIdentity(options.basis.frontier),
      checkpointIndexShards: options.checkpointIndexShards,
      tailWitnesses: sortTailWitnesses(options.tailWitnesses),
      reducerVersion: REDUCER_VERSION,
      projectionVersion: PROJECTION_VERSION,
    });
  }
}

function labelsAspect(labels: readonly string[]): string {
  if (labels.length === 0) {
    return 'labels:*';
  }
  const encoded = [...labels]
    .sort()
    .map((label) => `${label.length}:${label}`)
    .join('|');
  return `labels:${encoded}`;
}

function frontierIdentity(frontier: Map<string, string>): readonly ReadIdentityFrontierEntry[] {
  const entries: ReadIdentityFrontierEntry[] = [];
  const sortedFrontier = [...frontier.entries()]
    .sort(([leftWriter], [rightWriter]) => leftWriter.localeCompare(rightWriter));
  for (const [writerId, patchSha] of sortedFrontier) {
    entries.push(Object.freeze({ writerId, patchSha }));
  }
  return Object.freeze(entries);
}

function sortTailWitnesses(
  witnesses: readonly ReadIdentityTailWitness[],
): readonly ReadIdentityTailWitness[] {
  return Object.freeze(
    [...witnesses].sort((left, right) => compareTailWitnesses(left, right)),
  );
}

function compareTailWitnesses(
  left: ReadIdentityTailWitness,
  right: ReadIdentityTailWitness,
): number {
  return compareEventIds(
    new EventId(left.lamport, left.writerId, left.sha, 0),
    new EventId(right.lamport, right.writerId, right.sha, 0),
  );
}
