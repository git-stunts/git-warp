import { expect, vi } from 'vitest';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17MaterializationFallbackTrap {
  private readonly materializeGraph: ReturnType<typeof vi.spyOn>;

  constructor(graph: OpticFixtureGraph, message: string) {
    this.materializeGraph = vi.spyOn(graph, '_materializeGraph');
    this.materializeGraph.mockRejectedValue(new V17CheckpointTailOpticFixtureError(message));
    Object.freeze(this);
  }

  expectUnused(): void {
    expect(this.materializeGraph).not.toHaveBeenCalled();
  }
}
