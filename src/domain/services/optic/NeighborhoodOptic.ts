import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import QueryError from '../../errors/QueryError.ts';
import type NeighborhoodOpticReadResult from './NeighborhoodOpticReadResult.ts';
import Optic from './Optic.ts';

const NEIGHBORHOOD_OPTIC_KIND = 'neighborhood';

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
    this._optic = validateNeighborhoodOptic(options.optic);
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

function validateNeighborhoodOptic(optic: Optic): Optic {
  if (!(optic instanceof Optic) || optic.target.opticKind !== NEIGHBORHOOD_OPTIC_KIND) {
    throwNeighborhoodOpticError('optic', 'invalid-optic');
  }
  return optic;
}

function throwNeighborhoodOpticError(field: string, reason: string): never {
  throw new QueryError('Neighborhood optic is invalid.', {
    code: 'E_NEIGHBORHOOD_OPTIC',
    context: { field, reason },
  });
}
