import { expect, vi } from 'vitest';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

type ForbiddenMaterializationMethodName =
  | 'materialize'
  | '_materializeGraph'
  | 'getNodes'
  | 'getEdges';

type ForbiddenMaterializationSpy = {
  readonly methodName: ForbiddenMaterializationMethodName;
  readonly spy: ReturnType<typeof vi.spyOn>;
};

const FORBIDDEN_MATERIALIZATION_METHODS: readonly ForbiddenMaterializationMethodName[] = Object.freeze([
  'materialize',
  '_materializeGraph',
  'getNodes',
  'getEdges',
]);

export default class V17MaterializationFallbackTrap {
  private readonly forbiddenSpies: readonly ForbiddenMaterializationSpy[];

  constructor(graph: OpticFixtureGraph, message: string) {
    this.forbiddenSpies = Object.freeze(
      FORBIDDEN_MATERIALIZATION_METHODS.map((methodName) => {
        const spy = vi.spyOn(graph, methodName);
        spy.mockRejectedValue(new V17CheckpointTailOpticFixtureError(`${message}: ${methodName}`));
        return Object.freeze({ methodName, spy });
      }),
    );
    Object.freeze(this);
  }

  expectUnused(): void {
    for (const forbiddenSpy of this.forbiddenSpies) {
      expect(forbiddenSpy.spy, forbiddenSpy.methodName).not.toHaveBeenCalled();
    }
  }
}
