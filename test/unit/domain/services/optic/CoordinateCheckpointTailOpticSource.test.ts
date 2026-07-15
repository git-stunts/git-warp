import { describe, expect, it } from 'vitest';

import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import CoordinateCheckpointTailOpticSource from '../../../../../src/domain/services/optic/CoordinateCheckpointTailOpticSource.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import MockIndexStorage from '../../../../helpers/MockIndexStorage.ts';

class TestCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName = 'events';
  readonly _codec: CodecPort = defaultCodec;
  readonly _checkpointStore = new InMemoryCheckpointStore();
  readonly _indexStore = new MockIndexStorage();
  readonly chainCalls: Array<{ readonly tipSha: string; readonly stopAtSha: string | null }> = [];
  readonly validationCalls: Array<{ readonly writerId: string; readonly incomingSha: string }> = [];

  discoverWriters(): Promise<string[]> {
    return Promise.resolve(['live-writer']);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve('live-checkpoint-sha');
  }

  _loadPatchChainFromSha(
    tipSha: string,
    stopAtSha: string | null = null,
  ): Promise<CheckpointTailPatchEntry[]> {
    this.chainCalls.push({ tipSha, stopAtSha });
    return Promise.resolve([]);
  }

  _loadWriterPatches(): Promise<CheckpointTailPatchEntry[]> {
    throw new Error('coordinate reads must use the captured frontier');
  }

  _validatePatchAgainstCheckpoint(
    writerId: string,
    incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void> {
    this.validationCalls.push({ writerId, incomingSha });
    return Promise.resolve();
  }
}

describe('CoordinateCheckpointTailOpticSource', () => {
  it('captures a sorted frontier and reuses the source semantic ports', async () => {
    const source = new TestCheckpointTailOpticSource();
    const frontier = new Map([
      ['writer-b', 'patch-b'],
      ['writer-a', 'patch-a'],
    ]);
    const coordinate = new CoordinateCheckpointTailOpticSource({
      source,
      checkpointSha: 'coordinate-checkpoint-sha',
      frontier,
    });

    frontier.set('writer-c', 'patch-c');

    await expect(coordinate.discoverWriters()).resolves.toEqual(['writer-a', 'writer-b']);
    await expect(coordinate._readCheckpointSha()).resolves.toBe('coordinate-checkpoint-sha');
    expect(coordinate.graphName).toBe(source.graphName);
    expect(coordinate._codec).toBe(source._codec);
    expect(coordinate._checkpointStore).toBe(source._checkpointStore);
    expect(coordinate._indexStore).toBe(source._indexStore);
  });

  it('loads writer patches from the captured coordinate tip', async () => {
    const source = new TestCheckpointTailOpticSource();
    const coordinate = new CoordinateCheckpointTailOpticSource({
      source,
      checkpointSha: 'coordinate-checkpoint-sha',
      frontier: new Map([['writer-a', 'patch-a']]),
    });

    await coordinate._loadWriterPatches('writer-a', 'checkpoint-parent');
    await expect(coordinate._loadWriterPatches('missing-writer')).resolves.toEqual([]);
    await expect(coordinate._loadWriterPatches('writer-a', 'patch-a')).resolves.toEqual([]);

    expect(source.chainCalls).toEqual([
      { tipSha: 'patch-a', stopAtSha: 'checkpoint-parent' },
    ]);
  });

  it('delegates explicit chain loads and checkpoint validation', async () => {
    const source = new TestCheckpointTailOpticSource();
    const coordinate = new CoordinateCheckpointTailOpticSource({
      source,
      checkpointSha: 'coordinate-checkpoint-sha',
      frontier: new Map(),
    });

    await coordinate._loadPatchChainFromSha('tip-sha', 'stop-sha');
    await coordinate._validatePatchAgainstCheckpoint('writer-a', 'incoming-sha', null);

    expect(source.chainCalls).toEqual([{ tipSha: 'tip-sha', stopAtSha: 'stop-sha' }]);
    expect(source.validationCalls).toEqual([
      { writerId: 'writer-a', incomingSha: 'incoming-sha' },
    ]);
  });

  it('rejects malformed constructor frontier before copying entries', () => {
    expect(
      () =>
        new CoordinateCheckpointTailOpticSource({
          source: new TestCheckpointTailOpticSource(),
          checkpointSha: 'checkpoint-sha',
          // @ts-expect-error exercising runtime validation for JavaScript callers
          frontier: 'not-a-frontier',
        }),
    ).toThrow('Coordinate checkpoint-tail optic source requires a frontier Map');
  });

  it('rejects blank identity fields', () => {
    expect(
      () =>
        new CoordinateCheckpointTailOpticSource({
          source: new TestCheckpointTailOpticSource(),
          checkpointSha: '   ',
          frontier: new Map([['writer-1', 'patch-sha']]),
        }),
    ).toThrow('Coordinate checkpoint-tail optic source requires non-empty identity fields');

    expect(
      () =>
        new CoordinateCheckpointTailOpticSource({
          source: new TestCheckpointTailOpticSource(),
          checkpointSha: 'checkpoint-sha',
          frontier: new Map([['writer-1', '   ']]),
        }),
    ).toThrow('Coordinate checkpoint-tail optic source requires non-empty identity fields');
  });

  it('rejects malformed semantic source ports at the constructor boundary', () => {
    const malformedCheckpointStore = new TestCheckpointTailOpticSource();
    Object.defineProperty(malformedCheckpointStore, '_checkpointStore', {
      value: { resolveHead: () => Promise.resolve(null) },
    });
    const malformedIndexStore = new TestCheckpointTailOpticSource();
    Object.defineProperty(malformedIndexStore, '_indexStore', {
      value: { openShard: () => emptyBytes() },
    });
    const malformedCodec = new TestCheckpointTailOpticSource();
    Object.defineProperty(malformedCodec, '_codec', {
      value: { encode: () => new Uint8Array() },
    });

    for (const source of [malformedCheckpointStore, malformedIndexStore, malformedCodec]) {
      expect(
        () =>
          new CoordinateCheckpointTailOpticSource({
            source,
            checkpointSha: 'checkpoint-sha',
            frontier: new Map([['writer-1', 'patch-sha']]),
          }),
      ).toThrow(WarpError);
    }
  });
});

async function* emptyBytes(): AsyncIterable<Uint8Array> {
  yield new Uint8Array();
}
