import { z } from 'zod';

export const verifyAuditSchema = z.object({
  since: z.string().min(1, 'Missing value for --since').optional(),
  writer: z.string().min(1, 'Missing value for --writer').optional(),
  'trust-mode': z.enum(['warn', 'enforce']).optional(),
  'trust-pin': z.string().min(1, 'Missing value for --trust-pin').optional(),
}).strict();
