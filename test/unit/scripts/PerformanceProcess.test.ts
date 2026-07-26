import { describe, expect, it } from 'vitest';
import {
  spawnAndCollect,
} from '../../../scripts/performance/PerformanceProcess.ts';

describe('v19 performance worker process', () => {
  it('kills and rejects a worker that exceeds its timeout', async () => {
    await expect(spawnAndCollect(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1_000)'],
      process.env,
      50,
    )).rejects.toThrow('Performance worker timed out after 50 ms');
  });
});
