import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import type NeighborhoodOpticReadResult from './NeighborhoodOpticReadResult.ts';
import type Optic from './Optic.ts';

export type NeighborhoodOpticReadOptions = {
  readonly direction?: Direction;
  readonly labels?: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
};

export default class NeighborhoodOptic {
  private readonly _optic: Optic;
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: {
    readonly optic: Optic;
    readonly locator: CheckpointTailWitnessLocator;
  }) {
    this._optic = options.optic;
    this._locator = options.locator;
    Object.freeze(this);
  }

  toOptic(): Optic {
    return this._optic;
  }

  async read(options: NeighborhoodOpticReadOptions = {}): Promise<NeighborhoodOpticReadResult> {
    return await this._locator.readNeighborhood(this._optic, options);
  }
}
