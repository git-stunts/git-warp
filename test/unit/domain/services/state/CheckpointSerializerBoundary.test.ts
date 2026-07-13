import { describe, expect, it } from 'vitest';
import { deserializeFullState } from '../../../../../src/domain/services/state/CheckpointSerializer.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';

const codec = new CborCodec();

describe('CheckpointSerializer boundary defaults', () => {
  it('defaults omitted property and observed-frontier artifacts', () => {
    const bytes = codec.encode({
      version: 'full-v5',
      nodeAlive: { entries: [], tombstones: [] },
      edgeAlive: { entries: [], tombstones: [] },
    });

    const restored = deserializeFullState(bytes, { codec });

    expect(restored.propSize()).toBe(0);
    expect(restored.observedFrontier.size).toBe(0);
  });

  it('treats a non-array property artifact as empty', () => {
    const bytes = codec.encode({
      version: 'full-v5',
      nodeAlive: { entries: [], tombstones: [] },
      edgeAlive: { entries: [], tombstones: [] },
      prop: {},
      observedFrontier: {},
    });

    expect(deserializeFullState(bytes, { codec }).propSize()).toBe(0);
  });

  it('skips null property registers from persisted data', () => {
    const bytes = codec.encode({
      version: 'full-v5',
      nodeAlive: { entries: [], tombstones: [] },
      edgeAlive: { entries: [], tombstones: [] },
      prop: [['node\u0000name', null]],
      observedFrontier: {},
    });

    expect(deserializeFullState(bytes, { codec }).propSize()).toBe(0);
  });
});
