import { performance } from 'node:perf_hooks';
import { clearInterval, setInterval } from 'node:timers';
import { z } from 'zod';

export const MIGRATED_READ_RESULT_PREFIX = 'GIT_WARP_MIGRATED_READ_SAMPLE=';

export const MigratedReadWorkerResultSchema = z.object({
  basisId: z.string().min(1),
  basisKind: z.enum(['checkpoint-tail', 'opaque-evidence']),
  cpuSystemMs: z.number().nonnegative(),
  cpuTotalMs: z.number().nonnegative(),
  cpuUserMs: z.number().nonnegative(),
  key: z.literal('ordinal'),
  maxRssBytes: z.number().int().positive(),
  peakHeapUsedBytes: z.number().int().positive(),
  receiptStatus: z.literal('completed').nullable(),
  subject: z.literal('medium:document:015'),
  supportStatus: z.enum(['checkpoint-tail', 'supported']),
  value: z.literal(15),
  wallMs: z.number().positive(),
});

export type MigratedReadWorkerResult = z.infer<
  typeof MigratedReadWorkerResultSchema
>;

export async function measureMigratedRead(
  operation: () => Promise<Readonly<{
    basisId: string;
    basisKind: 'checkpoint-tail' | 'opaque-evidence';
    receiptStatus: 'completed' | null;
    supportStatus: 'checkpoint-tail' | 'supported';
    value: 15;
  }>>,
): Promise<MigratedReadWorkerResult> {
  const memory = startMemorySampler();
  const cpuBefore = process.cpuUsage();
  const started = performance.now();
  try {
    const result = await operation();
    const cpu = process.cpuUsage(cpuBefore);
    memory.sample();
    return Object.freeze({
      basisId: result.basisId,
      basisKind: result.basisKind,
      cpuSystemMs: cpu.system / 1000,
      cpuTotalMs: (cpu.user + cpu.system) / 1000,
      cpuUserMs: cpu.user / 1000,
      key: 'ordinal',
      ...memory.snapshot(),
      receiptStatus: result.receiptStatus,
      subject: 'medium:document:015',
      supportStatus: result.supportStatus,
      value: result.value,
      wallMs: performance.now() - started,
    });
  } finally {
    memory.stop();
  }
}

export function printMigratedReadResult(
  result: MigratedReadWorkerResult,
): void {
  process.stdout.write(
    `${MIGRATED_READ_RESULT_PREFIX}${JSON.stringify(result)}\n`,
  );
}

export function requiredArgument(
  args: readonly string[],
  name: string,
): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function startMemorySampler(): Readonly<{
  sample: () => void;
  snapshot: () => Readonly<{
    maxRssBytes: number;
    peakHeapUsedBytes: number;
  }>;
  stop: () => void;
}> {
  let peakHeapUsedBytes = 0;
  let peakRssBytes = 0;
  const sample = (): void => {
    const usage = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, usage.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, usage.rss);
  };
  const sampler = setInterval(sample, 5);
  sampler.unref();
  sample();
  return Object.freeze({
    sample,
    snapshot: () => Object.freeze({
      maxRssBytes: Math.max(
        peakRssBytes,
        process.resourceUsage().maxRSS * 1024,
      ),
      peakHeapUsedBytes,
    }),
    stop: () => { clearInterval(sampler); },
  });
}
