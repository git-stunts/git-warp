import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import type NodeOpticReadResult from './NodeOpticReadResult.ts';
import NodePropertyOptic from './NodePropertyOptic.ts';

export default class NodeOptic {
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

  async read(): Promise<NodeOpticReadResult> {
    return await this._locator.readNode(this._nodeId);
  }

  prop(key: string): NodePropertyOptic {
    return new NodePropertyOptic({
      nodeId: this._nodeId,
      propertyKey: key,
      locator: this._locator,
    });
  }
}
