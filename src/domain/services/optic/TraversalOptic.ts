import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
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
    this._startNodeId = options.startNodeId;
    this._locator = options.locator;
    Object.freeze(this);
  }

  async read(options: TraversalOpticReadOptions = {}): TraversalOpticReadPromise {
    return await this._locator.readTraversal(this._startNodeId, options);
  }
}

export { TraversalOpticCursor };
