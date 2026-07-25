import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const HEAP_CAP_MIB = 64;
const CHILD_PATH = new URL('../../fixtures/runtime-observer-memory-child.ts', import.meta.url)
  .pathname;

describe('Runtime Observer memory cap', () => {
  it('completes a warm-reopen bounded observation under an explicit old-space cap', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [`--max-old-space-size=${HEAP_CAP_MIB}`, CHILD_PATH],
      {
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
      }
    );
    const result = JSON.parse(stdout.trim()) as MemoryCapResult;

    expect(result.configuredHeapCapMiB).toBe(HEAP_CAP_MIB);
    expect(result.peakHeapUsedMiB).toBeLessThan(HEAP_CAP_MIB);
    expect(result.materializeCalls).toBe(0);
    expect(result.wholeIndexScans).toBe(0);
    expect(result.first).toEqual(expectedObservation());
    expect(result.second).toEqual(result.first);
  }, 130_000);
});

function expectedObservation() {
  return {
    property: 'ready',
    propertyReceiptStatus: 'completed',
    neighborhood: {
      subject: 'node:hub',
      direction: 'out',
      edges: [
        {
          direction: 'out',
          neighborId: 'node:neighbor',
          label: 'contains',
        },
      ],
      completeness: 'complete',
      cursor: null,
    },
    neighborhoodReceiptStatus: 'completed',
  };
}

type MemoryCapResult = Readonly<{
  configuredHeapCapMiB: number;
  heapLimitMiB: number;
  peakHeapUsedMiB: number;
  peakRssMiB: number;
  materializeCalls: number;
  wholeIndexScans: number;
  first: unknown;
  second: unknown;
}>;
