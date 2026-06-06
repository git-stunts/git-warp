import { describe, expect, it } from 'vitest';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import TraversalOptic from '../../../../../src/domain/services/optic/TraversalOptic.ts';
import CheckpointTailWitnessLocator from '../../../../../src/domain/services/optic/CheckpointTailWitnessLocator.ts';

describe('TraversalOptic', () => {
  it('rejects an empty start node id at construction', () => {
    expect(() => new TraversalOptic({
      startNodeId: '',
      locator: locator(),
    })).toThrow(QueryError);
  });
});

function locator(): CheckpointTailWitnessLocator {
  return Object.create(CheckpointTailWitnessLocator.prototype) as CheckpointTailWitnessLocator;
}
