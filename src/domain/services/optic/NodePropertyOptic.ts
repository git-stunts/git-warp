import type CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import type NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import type Optic from './Optic.ts';

export default class NodePropertyOptic {
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

  async read(): Promise<NodePropertyOpticReadResult> {
    return await this._locator.readNodeProperty(this._optic);
  }
}
