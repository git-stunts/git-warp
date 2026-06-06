import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';
import CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import {
  type TraversalOpticStrategy,
  TraversalOpticCursor,
} from './TraversalOpticReadResult.ts';

type TraversalOpticReadPromise = ReturnType<CheckpointTailWitnessLocator['readTraversal']>;

export type TraversalOpticReadOptions = {
  readonly strategy?: TraversalOpticStrategy;
  readonly direction?: Direction;
  readonly labels?: readonly string[];
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxEdges?: number;
  readonly goalNodeId?: string;
  readonly cursor?: TraversalOpticCursor;
};

export default class TraversalOptic {
  private readonly _startNodeId: string;
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: {
    readonly startNodeId: string;
    readonly locator: CheckpointTailWitnessLocator;
  }) {
    this._startNodeId = validateStartNodeId(options.startNodeId);
    this._locator = validateLocator(options.locator);
    Object.freeze(this);
  }

  async read(options: TraversalOpticReadOptions = {}): TraversalOpticReadPromise {
    return await this._locator.readTraversal(this._startNodeId, options);
  }
}

export { TraversalOpticCursor };

function validateStartNodeId(startNodeId: string): string {
  if (typeof startNodeId !== 'string' || startNodeId.length === 0) {
    throwTraversalOpticError('startNodeId', 'empty-string');
  }
  return startNodeId;
}

function validateLocator(locator: CheckpointTailWitnessLocator): CheckpointTailWitnessLocator {
  if (!(locator instanceof CheckpointTailWitnessLocator)) {
    throwTraversalOpticError('locator', 'invalid-locator');
  }
  return locator;
}

function throwTraversalOpticError(field: string, reason: string): never {
  throw new QueryError('Traversal optic is invalid.', {
    code: 'E_TRAVERSAL_OPTIC',
    context: { field, reason },
  });
}
