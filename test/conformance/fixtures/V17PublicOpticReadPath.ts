import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17PublicOpticReadPath {
  private readonly worldline: object;

  constructor(worldline: object) {
    this.worldline = worldline;
    Object.freeze(this);
  }

  async readNode(nodeId: string): Promise<object> {
    const optic = this.invokeObject(this.worldline, 'optic');
    const nodeScope = this.invokeObject(optic, 'node', [nodeId]);
    return await this.invokePromiseObject(nodeScope, 'read');
  }

  async readNodeProperty(nodeId: string, propertyKey: string): Promise<object> {
    const optic = this.invokeObject(this.worldline, 'optic');
    const nodeScope = this.invokeObject(optic, 'node', [nodeId]);
    const propertyScope = this.invokeObject(nodeScope, 'prop', [propertyKey]);
    return await this.invokePromiseObject(propertyScope, 'read');
  }

  private invokeObject(receiver: object, methodName: string, args: readonly string[] = []): object {
    const method = Reflect.get(receiver, methodName);
    if (typeof method !== 'function') {
      throw new V17CheckpointTailOpticFixtureError(`${methodName}() must exist for v17 optic RED`);
    }

    const result = method.call(receiver, ...args);
    if (typeof result !== 'object' || result === null) {
      throw new V17CheckpointTailOpticFixtureError(`${methodName}() must return an object for v17 optic RED`);
    }

    return result;
  }

  private async invokePromiseObject(receiver: object, methodName: string): Promise<object> {
    const method = Reflect.get(receiver, methodName);
    if (typeof method !== 'function') {
      throw new V17CheckpointTailOpticFixtureError(`${methodName}() must exist for v17 optic RED`);
    }

    const result = method.call(receiver);
    if (!(result instanceof Promise)) {
      throw new V17CheckpointTailOpticFixtureError(`${methodName}() must return a Promise for v17 optic RED`);
    }

    const awaited = await result;
    if (typeof awaited !== 'object' || awaited === null) {
      throw new V17CheckpointTailOpticFixtureError(
        `${methodName}() must resolve to an object for v17 optic RED`,
      );
    }

    return awaited;
  }
}
