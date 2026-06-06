import CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import NeighborhoodOptic from './NeighborhoodOptic.ts';
import NodeOptic from './NodeOptic.ts';
import TraversalOptic from './TraversalOptic.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

export default class WorldlineOptic {
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: { readonly source: CheckpointTailOpticSource }) {
    this._locator = new CheckpointTailWitnessLocator({ source: options.source });
    Object.freeze(this);
  }

  node(nodeId: string): NodeOptic {
    return new NodeOptic({ nodeId, locator: this._locator });
  }

  neighborhood(nodeId: string): NeighborhoodOptic {
    return new NeighborhoodOptic({ nodeId, locator: this._locator });
  }

  traversal(startNodeId: string): TraversalOptic {
    return new TraversalOptic({ startNodeId, locator: this._locator });
  }
}
