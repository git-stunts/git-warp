import { describe, expect, it } from 'vitest';

import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import {
  CheckpointNodeLivenessFact,
} from '../../../../../src/domain/services/optic/CheckpointBasisFact.ts';
import {
  closeFactCursors,
  type FactStreamCursor,
  type FactWithEvent,
} from '../../../../../src/domain/services/optic/CheckpointPatchFactCursor.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

describe('CheckpointPatchFactCursor', () => {
  it('attempts to close every cursor when one iterator close rejects', async () => {
    const failure = new QueryError('cursor close failed', {
      code: 'E_TEST_CURSOR_CLOSE',
      context: { writerId: 'writer-a' },
    });
    const first = new TestFactIterator({ writerId: 'writer-a', failure });
    const second = new TestFactIterator({ writerId: 'writer-b', failure: null });

    await expect(closeFactCursors([
      factCursor('writer-a', first),
      factCursor('writer-b', second),
    ])).rejects.toBe(failure);

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(true);
  });
});

class TestFactIterator implements AsyncIterator<FactWithEvent> {
  readonly writerId: string;
  readonly failure: QueryError | null;
  closed: boolean;

  constructor(options: { readonly writerId: string; readonly failure: QueryError | null }) {
    this.writerId = options.writerId;
    this.failure = options.failure;
    this.closed = false;
  }

  next(): Promise<IteratorResult<FactWithEvent>> {
    return Promise.resolve({ done: true, value: factWithEvent(this.writerId) });
  }

  return(): Promise<IteratorResult<FactWithEvent>> {
    this.closed = true;
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve({ done: true, value: factWithEvent(this.writerId) });
  }
}

function factCursor(writerId: string, iterator: AsyncIterator<FactWithEvent>): FactStreamCursor {
  return Object.freeze({
    writerId,
    iterator,
    current: factWithEvent(writerId),
  });
}

function factWithEvent(writerId: string): FactWithEvent {
  const eventId = new EventId(1, writerId, patchSha(writerId), 0);
  return Object.freeze({
    eventId,
    fact: new CheckpointNodeLivenessFact({
      nodeId: writerId,
      alive: true,
      eventId,
    }),
  });
}

function patchSha(writerId: string): string {
  return writerId === 'writer-a' ? 'aaaa' : 'bbbb';
}
