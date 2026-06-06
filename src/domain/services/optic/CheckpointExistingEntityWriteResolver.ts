import type WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
import type { CheckpointBasisFact } from './CheckpointBasisFact.ts';
import CheckpointFactResolver, { type CheckpointEdgeIdentity } from './CheckpointFactResolver.ts';

export type CheckpointExistingEntityWriteResolverFields = {
  readonly pool: WarpMemoryPool;
};

/** Write precondition resolver for existing entities over bounded checkpoint facts. */
export default class CheckpointExistingEntityWriteResolver {
  private readonly _factResolver: CheckpointFactResolver;

  constructor(fields: CheckpointExistingEntityWriteResolverFields) {
    this._factResolver = new CheckpointFactResolver({ pool: fields.pool });
    Object.freeze(this);
  }

  async canWriteNodeProperty(
    facts: AsyncIterable<CheckpointBasisFact>,
    nodeId: string,
  ): Promise<boolean> {
    return await this._factResolver.resolveNodeLiveness(facts, nodeId) === true;
  }

  async canWriteEdgeProperty(
    facts: AsyncIterable<CheckpointBasisFact>,
    edge: CheckpointEdgeIdentity,
  ): Promise<boolean> {
    const resolution = await this._factResolver.resolveEdgeEndpoints(facts, edge);
    return resolution?.alive === true;
  }
}
