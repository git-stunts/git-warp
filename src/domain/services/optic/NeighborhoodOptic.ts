import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import type NeighborhoodOpticReadResult from './NeighborhoodOpticReadResult.ts';

export type NeighborhoodOpticReadOptions = {
  readonly direction?: Direction;
  readonly labels?: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
};

export default class NeighborhoodOptic {
  private readonly _nodeId: string;
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: {
    readonly nodeId: string;
    readonly locator: CheckpointTailWitnessLocator;
  }) {
    this._nodeId = options.nodeId;
    this._locator = options.locator;
    Object.freeze(this);
  }

  async read(options: NeighborhoodOpticReadOptions = {}): Promise<NeighborhoodOpticReadResult> {
    return await this._locator.readNeighborhood(this._nodeId, options);
  }
}
