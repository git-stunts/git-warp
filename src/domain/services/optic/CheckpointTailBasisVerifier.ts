import type { OpticReadFailureCauseValue } from './OpticReadFailureCause.ts';
import QueryError from '../../errors/QueryError.ts';
import { isCurrentCheckpointSchema } from '../state/checkpointHelpers.ts';
import { isStaleCheckpointMaterialization } from '../state/StaleCheckpointMaterialization.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type { CheckpointBasis } from '../../../ports/CheckpointStorePort.ts';

export type CheckpointTailBasisVerification = {
  readonly checkpointSha: string;
};

/** Verifies bounded checkpoint support through the semantic checkpoint store. */
export default class CheckpointTailBasisVerifier {
  private readonly _source: CheckpointTailOpticSource;

  constructor(options: { readonly source: CheckpointTailOpticSource }) {
    this._source = options.source;
    Object.freeze(this);
  }

  async verify(): Promise<CheckpointTailBasisVerification> {
    const checkpointSha = requireCheckpointSha(
      this._source.graphName,
      await this._source._readCheckpointSha(),
    );
    await verifyCheckpointBasis(this._source, checkpointSha);
    return Object.freeze({ checkpointSha });
  }
}

function requireCheckpointSha(graphName: string, checkpointSha: string | null): string {
  if (checkpointSha === null) {
    throwNoBoundedBasis(graphName, 'missing-checkpoint');
  }
  return checkpointSha;
}

async function verifyCheckpointBasis(
  source: CheckpointTailOpticSource,
  checkpointSha: string,
): Promise<void> {
  try {
    const basis = await source._checkpointStore.loadBasis(checkpointSha, source.graphName);
    requireCurrentSchema(source.graphName, basis.schema);
    requireIndexShards(source.graphName, basis);
  } catch (error) {
    throwUnavailableBasis(source.graphName, error instanceof Error ? error : null);
  }
}

function throwUnavailableBasis(graphName: string, error: Error | null): never {
  if (error instanceof QueryError && error.code === 'E_OPTIC_NO_BOUNDED_BASIS') {
    throw error;
  }
  if (error !== null && isStaleCheckpointMaterialization(error)) {
    throwNoBoundedBasis(graphName, 'checkpoint-without-index-tree');
  }
  throwNoBoundedBasis(graphName, 'checkpoint-basis-unavailable');
}

function requireCurrentSchema(graphName: string, schema: number): void {
  if (!isCurrentCheckpointSchema(schema)) {
    throwNoBoundedBasis(graphName, 'checkpoint-without-index-tree');
  }
}

function requireIndexShards(
  graphName: string,
  basis: CheckpointBasis,
): void {
  if (Object.keys(basis.indexShardHandles).length === 0 && basis.indexRoot === null) {
    throwNoBoundedBasis(graphName, 'checkpoint-missing-index-shards');
  }
}

function throwNoBoundedBasis(graphName: string, reason: OpticReadFailureCauseValue): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}
