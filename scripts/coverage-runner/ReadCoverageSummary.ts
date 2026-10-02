import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const summarySchema = z.object({
  total: z.object({
    lines: z.object({ pct: z.number().finite().min(0).max(100) }),
  }),
});

/** Validate the fresh Vitest report at the JSON module boundary. */
export async function readCoverageLines(path: string): Promise<number> {
  const summary = summarySchema.parse(
    (await import(pathToFileURL(path).href, { with: { type: 'json' } })).default,
  );
  return summary.total.lines.pct;
}
