import type { CliOptions } from '../types.ts';
import { CliError, usageError } from '../infrastructure.ts';
import { openRequiredLane, withRuntime } from '../v19/V19Runtime.ts';
import { stableStringify } from '../../presenters/json.ts';
import handleSubstrateAudit from './verify-audit.ts';

export default async function handleAudit({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<{
  readonly payload: object;
  readonly human: string;
  readonly exitCode: number;
}> {
  if (args.length > 0) {
    throw usageError('audit accepts only global v19 options');
  }
  return await withRuntime(options, async (runtime) => {
    await openRequiredLane(runtime, options.lane);
    const result = await handleSubstrateAudit({
      options,
      args: options.writerExplicit
        ? ['--writer', options.writer]
        : [],
    });
    return {
      payload: requireObject(result.payload),
      human: stableStringify(result.payload),
      exitCode: result.exitCode,
    };
  });
}

function requireObject(value: unknown): object {
  if (value === null || typeof value !== 'object') {
    throw new CliError('Audit result must be an object', {
      code: 'E_AUDIT_RESULT',
    });
  }
  return value;
}
