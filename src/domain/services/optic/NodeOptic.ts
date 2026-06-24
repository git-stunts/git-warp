import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import QueryError from '../../errors/QueryError.ts';
import NeighborhoodOptic from './NeighborhoodOptic.ts';
import type NodeOpticReadResult from './NodeOpticReadResult.ts';
import NodePropertyOptic from './NodePropertyOptic.ts';
import Optic from './Optic.ts';
import TraversalOptic from './TraversalOptic.ts';

const NODE_OPTIC_KIND = 'node';

export default class NodeOptic {
  private readonly _optic: Optic;
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: {
    readonly optic: Optic;
    readonly locator: CheckpointTailWitnessLocator;
  }) {
    this._optic = validateNodeOptic(options.optic);
    this._locator = options.locator;
    Object.freeze(this);
  }

  toOptic(): Optic {
    return this._optic;
  }

  async read(): Promise<NodeOpticReadResult> {
    return await this._locator.readNode(this._optic);
  }

  prop(key: string): NodePropertyOptic {
    return new NodePropertyOptic({
      optic: this._optic.nodeProperty(key),
      locator: this._locator,
    });
  }

  neighbors(): NeighborhoodOptic {
    return new NeighborhoodOptic({
      optic: this._optic.neighborhood(),
      locator: this._locator,
    });
  }

  traverse(): TraversalOptic {
    return new TraversalOptic({
      optic: this._optic.traversal('global-discovery-refused'),
      locator: this._locator,
    });
  }
}

function validateNodeOptic(optic: Optic): Optic {
  if (!(optic instanceof Optic) || optic.target.opticKind !== NODE_OPTIC_KIND) {
    throwNodeOpticError('optic', 'invalid-optic');
  }
  return optic;
}

function throwNodeOpticError(field: string, reason: string): never {
  throw new QueryError('Node optic is invalid.', {
    code: 'E_NODE_OPTIC',
    context: { field, reason },
  });
}
