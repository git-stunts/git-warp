import { vi } from 'vitest';
import Patch from '../../../src/domain/types/Patch.ts';
import {
  TAIL_BUDGET_OBSERVED,
} from './V17CheckpointTailOpticFixtureData.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';

export default class V17TailBudgetExceededFixture {
  constructor(graph: OpticFixtureGraph) {
    vi.spyOn(graph, '_loadWriterPatches')
      .mockResolvedValue(this.createTailBudgetExceededPatchEntries());
    Object.freeze(this);
  }

  private createTailBudgetExceededPatchEntries(): Array<{ readonly patch: Patch; readonly sha: string }> {
    return Array.from({ length: TAIL_BUDGET_OBSERVED }, (_unused, index) => Object.freeze({
      patch: new Patch({
        writer: 'reader',
        lamport: index + 1,
        context: {},
        ops: [],
      }),
      sha: `tail-budget-${index}`,
    }));
  }
}
