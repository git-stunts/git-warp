import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import QueryError from '../../errors/QueryError.ts';
import type NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import Optic from './Optic.ts';

const NODE_PROPERTY_OPTIC_KIND = 'node-property';

export default class NodePropertyOptic {
  private readonly _optic: Optic;
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: {
    readonly optic: Optic;
    readonly locator: CheckpointTailWitnessLocator;
  }) {
    this._optic = validateNodePropertyOptic(options.optic);
    this._locator = options.locator;
    Object.freeze(this);
  }

  toOptic(): Optic {
    return this._optic;
  }

  async read(): Promise<NodePropertyOpticReadResult> {
    return await this._locator.readNodeProperty(this._optic);
  }
}

function validateNodePropertyOptic(optic: Optic): Optic {
  if (!(optic instanceof Optic) || optic.target.opticKind !== NODE_PROPERTY_OPTIC_KIND) {
    throwNodePropertyOpticError('optic', 'invalid-optic');
  }
  return optic;
}

function throwNodePropertyOpticError(field: string, reason: string): never {
  throw new QueryError('Node property optic is invalid.', {
    code: 'E_NODE_PROPERTY_OPTIC',
    context: { field, reason },
  });
}
