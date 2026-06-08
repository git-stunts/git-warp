import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
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
    const validFields = requireResolverFields(fields);
    this._factResolver = new CheckpointFactResolver({ pool: validFields.pool });
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

function requireResolverFields(
  fields: CheckpointExistingEntityWriteResolverFields | null | undefined,
): CheckpointExistingEntityWriteResolverFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('CheckpointExistingEntityWriteResolver requires object fields', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'fields' },
  });
}
