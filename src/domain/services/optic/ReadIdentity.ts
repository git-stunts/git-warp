import QueryError from '../../errors/QueryError.ts';

export type ReadIdentityFrontierEntry = {
  readonly writerId: string;
  readonly patchSha: string;
};

export type ReadIdentityIndexShard = {
  readonly path: string;
  readonly oid: string;
};

export type ReadIdentityTailWitness = {
  readonly sha: string;
  readonly writerId: string;
  readonly lamport: number;
};

export type ReadIdentityOptions = {
  readonly worldline: string;
  readonly entityAspect: string;
  readonly checkpointSha: string;
  readonly checkpointFrontier: readonly ReadIdentityFrontierEntry[];
  readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
  readonly tailWitnesses: readonly ReadIdentityTailWitness[];
  readonly reducerVersion: string;
  readonly projectionVersion: string;
};

export default class ReadIdentity {
  readonly kind: 'checkpoint-tail-read' = 'checkpoint-tail-read';
  readonly basis: 'checkpointReadBasis+tailWitnesses' = 'checkpointReadBasis+tailWitnesses';
  readonly worldline: string;
  readonly entityAspect: string;
  readonly checkpointSha: string;
  readonly checkpointFrontier: readonly ReadIdentityFrontierEntry[];
  readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
  readonly tailWitnesses: readonly ReadIdentityTailWitness[];
  readonly reducerVersion: string;
  readonly projectionVersion: string;

  constructor(options: ReadIdentityOptions) {
    assertNonEmpty(options.worldline, 'worldline');
    assertNonEmpty(options.entityAspect, 'entityAspect');
    assertNonEmpty(options.checkpointSha, 'checkpointSha');
    assertNonEmpty(options.reducerVersion, 'reducerVersion');
    assertNonEmpty(options.projectionVersion, 'projectionVersion');

    this.worldline = options.worldline;
    this.entityAspect = options.entityAspect;
    this.checkpointSha = options.checkpointSha;
    this.checkpointFrontier = freezeFrontier(options.checkpointFrontier);
    this.checkpointIndexShards = freezeIndexShards(options.checkpointIndexShards);
    this.tailWitnesses = freezeTailWitnesses(options.tailWitnesses);
    this.reducerVersion = options.reducerVersion;
    this.projectionVersion = options.projectionVersion;
    Object.freeze(this);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) {
    throw new QueryError('read identity requires non-empty fields', {
      code: 'E_OPTIC_READ_IDENTITY',
      context: { field },
    });
  }
}

function freezeFrontier(
  entries: readonly ReadIdentityFrontierEntry[],
): readonly ReadIdentityFrontierEntry[] {
  return Object.freeze(
    entries.map((entry) => Object.freeze({
      writerId: entry.writerId,
      patchSha: entry.patchSha,
    })),
  );
}

function freezeIndexShards(
  shards: readonly ReadIdentityIndexShard[],
): readonly ReadIdentityIndexShard[] {
  return Object.freeze(
    shards.map((shard) => Object.freeze({
      path: shard.path,
      oid: shard.oid,
    })),
  );
}

function freezeTailWitnesses(
  witnesses: readonly ReadIdentityTailWitness[],
): readonly ReadIdentityTailWitness[] {
  return Object.freeze(
    witnesses.map((witness) => Object.freeze({
      sha: witness.sha,
      writerId: witness.writerId,
      lamport: witness.lamport,
    })),
  );
}
