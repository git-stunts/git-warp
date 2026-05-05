import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import type NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';

export default class NodePropertyOptic {
  private readonly _nodeId: string;
  private readonly _propertyKey: string;
  private readonly _locator: CheckpointTailWitnessLocator;

  constructor(options: {
    readonly nodeId: string;
    readonly propertyKey: string;
    readonly locator: CheckpointTailWitnessLocator;
  }) {
    this._nodeId = options.nodeId;
    this._propertyKey = options.propertyKey;
    this._locator = options.locator;
    Object.freeze(this);
  }

  async read(): Promise<NodePropertyOpticReadResult> {
    return await this._locator.readNodeProperty(this._nodeId, this._propertyKey);
  }
}
