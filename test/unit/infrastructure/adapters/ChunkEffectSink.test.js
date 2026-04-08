import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChunkEffectSink } from '../../../../src/infrastructure/adapters/ChunkEffectSink.js';
import { createEffectEmission } from '../../../../src/domain/types/EffectEmission.ts';
import { LIVE_LENS, REPLAY_LENS } from '../../../../src/domain/types/ExternalizationPolicy.ts';
import EffectSinkPort from '../../../../src/ports/EffectSinkPort.ts';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @returns {import('../../../../src/domain/types/EffectEmission.ts').EffectEmission} */
function makeEmission(id = 'em-1') {
  return createEffectEmission({
    id,
    kind: 'test',
    payload: { data: 'value' },
    timestamp: 1000,
    writer: 'alice',
    coordinate: { frontier: null, ceiling: null },
  });
}

describe('ChunkEffectSink', () => {
  /** @type {string} */
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chunk-sink-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('is an EffectSinkPort', () => {
    const sink = new ChunkEffectSink({ dir });
    expect(sink).toBeInstanceOf(EffectSinkPort);
  });

  it('has id "chunk"', () => {
    const sink = new ChunkEffectSink({ dir });
    expect(sink.id).toBe('chunk');
  });

  it('accepts a custom id', () => {
    const sink = new ChunkEffectSink({ dir, id: 'my-chunk' });
    expect(sink.id).toBe('my-chunk');
  });

  it('writes an emission to a file as NDJSON', async () => {
    const sink = new ChunkEffectSink({ dir });
    const obs = await sink.deliver(makeEmission(), LIVE_LENS);

    expect(obs.outcome).toBe('delivered');

    const files = await readdir(dir);
    expect(files.length).toBeGreaterThanOrEqual(1);

    const firstFile = files[0]; if (!firstFile) { throw new Error('expected file'); }
    const content = await readFile(join(dir, firstFile), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const parsed = JSON.parse(lines[0] ?? '');
    expect(parsed.id).toBe('em-1');
    expect(parsed.kind).toBe('test');
  });

  it('appends multiple emissions to the same chunk file', async () => {
    const sink = new ChunkEffectSink({ dir });
    await sink.deliver(makeEmission('em-1'), LIVE_LENS);
    await sink.deliver(makeEmission('em-2'), LIVE_LENS);

    const files = await readdir(dir);
    expect(files).toHaveLength(1);

    const firstChunk = files[0]; if (!firstChunk) { throw new Error('expected file'); }
    const content = await readFile(join(dir, firstChunk), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('rotates when byte budget is exceeded', async () => {
    const sink = new ChunkEffectSink({ dir, maxBytes: 100 });

    // Emit enough to exceed the small byte budget
    for (let i = 0; i < 5; i++) {
      await sink.deliver(makeEmission(`em-${i}`), LIVE_LENS);
    }

    const files = await readdir(dir);
    expect(files.length).toBeGreaterThan(1);
  });

  it('still writes during replay (chunk sink is replay-safe)', async () => {
    const sink = new ChunkEffectSink({ dir });
    const obs = await sink.deliver(makeEmission(), REPLAY_LENS);

    // ChunkEffectSink is replay-safe: it writes to local forensic log
    // regardless of delivery lens
    expect(obs.outcome).toBe('delivered');

    const files = await readdir(dir);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});
