import { z } from 'zod';

const CAPABILITY_SCHEMA = z.object({
  cliOrder: z.number().int().positive().optional(),
  cliCommand: z.string().min(1).optional(),
  cliSummary: z.string().min(1).optional(),
  cliUsage: z.string().min(1).optional(),
  mcpOrder: z.number().int().positive().optional(),
  mcpName: z.string().regex(/^warp_[a-z_]+$/u).optional(),
  mcpDescription: z.string().min(1).optional(),
});

export type CapabilityMetadata = z.infer<typeof CAPABILITY_SCHEMA>;

export class CapabilityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityContractError';
  }
}

export function parseCapabilityMetadata(
  field: string,
  raw: unknown,
): CapabilityMetadata {
  if (raw === undefined) {
    throw new CapabilityContractError(
      `${field} is missing required capability metadata`,
    );
  }
  const parsed = CAPABILITY_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new CapabilityContractError(
      `${field} has invalid capability metadata: ${parsed.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }
  return parsed.data;
}
