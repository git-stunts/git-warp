import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';
import CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import Optic from './Optic.ts';
import OpticSupportRule from './OpticSupportRule.ts';
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
  private readonly _optic: Optic;
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: {
    readonly optic: Optic;
    readonly locator: CheckpointTailWitnessLocator;
  }) {
    this._optic = validateTraversalOptic(options.optic);
    this._locator = validateLocator(options.locator);
    Object.freeze(this);
  }

  toOptic(options: TraversalOpticReadOptions = {}): Optic {
    return this._optic.withSupportRule(traversalSupportRule(options));
  }

  async read(options: TraversalOpticReadOptions = {}): TraversalOpticReadPromise {
    return await this._locator.readTraversal(this.toOptic(options), options);
  }
}

export { TraversalOpticCursor };

function validateTraversalOptic(optic: Optic): Optic {
  if (!(optic instanceof Optic) || optic.target.opticKind !== 'traversal') {
    throwTraversalOpticError('optic', 'invalid-optic');
  }
  return optic;
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

function traversalSupportRule(options: TraversalOpticReadOptions): OpticSupportRule {
  if (
    options.maxDepth === undefined
    || options.maxNodes === undefined
    || options.maxEdges === undefined
  ) {
    return OpticSupportRule.globalDiscoveryRefused();
  }
  return OpticSupportRule.traversalWindow();
}
