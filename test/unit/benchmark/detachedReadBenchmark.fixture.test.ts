import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { computeStateHash } from '../../../src/domain/services/state/StateSerializer.ts';
import {
  createDetachedReadBenchmarkPlan,
  DETACHED_READ_BENCHMARK_KINDS,
  DETACHED_READ_BENCHMARK_SCALES,
  seedDetachedReadBenchmarkFixture,
} from '../../benchmark/detachedReadBenchmark.fixture.ts';
import { describe, expect, it } from 'vitest';

const crypto = new NodeCryptoAdapter();

/**
 * @param {unknown} state
 * @returns {Promise<string>}
 */
async function hashState(state) {
  return await computeStateHash(
    (state),
    { crypto, codec: defaultCodec },
  );
}

describe('detached read benchmark fixture', () => {
  it('enumerates deterministic coverage for live, coordinate, and strand reads', () => {
    const plan = createDetachedReadBenchmarkPlan();
    const labels = new Set(plan.map((entry) => entry.label));

    expect(DETACHED_READ_BENCHMARK_SCALES).toEqual([250, 1000, 2500]);
    expect(DETACHED_READ_BENCHMARK_KINDS).toEqual(['live', 'coordinate', 'strand']);
    expect(plan).toHaveLength(DETACHED_READ_BENCHMARK_SCALES.length * DETACHED_READ_BENCHMARK_KINDS.length);
    expect(labels.size).toBe(plan.length);
    expect(labels).toEqual(new Set([
      'live:250',
      'coordinate:250',
      'strand:250',
      'live:1000',
      'coordinate:1000',
      'strand:1000',
      'live:2500',
      'coordinate:2500',
      'strand:2500',
    ]));
  });

  it('seeds a meaningful fixture for detached read comparisons', async () => {
    const fixture = await seedDetachedReadBenchmarkFixture({
      patchCount: 24,
      writerCount: 3,
      overlayPatchCount: 4,
    }) as { graph: any; coordinateSource: any; strandId: any; captureAt: number; overlayPatchCount: number };

    const liveState = await fixture.graph.materialize();
    const coordinateState = await fixture.graph.materializeCoordinate(fixture.coordinateSource);
    const strandState = await fixture.graph.materializeStrand(fixture.strandId);

    expect(fixture.captureAt).toBeGreaterThan(1);
    expect(fixture.overlayPatchCount).toBe(4);
    expect(await hashState(liveState)).toBe(await hashState(coordinateState));
    expect(await hashState(strandState)).not.toBe(await hashState(liveState));
  });
});
