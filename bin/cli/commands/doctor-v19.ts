import { z } from 'zod';

import { stableStringify } from '../../presenters/json.ts';
import handleSubstrateDoctor from './doctor/index.ts';
import { parseCommandArgs } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { openRequiredLane, withRuntime } from '../v19/V19Runtime.ts';

const DOCTOR_SCHEMA = z.object({}).strict();

export default async function handleDoctor({
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
  parseCommandArgs(args, {}, DOCTOR_SCHEMA);
  return await withRuntime(options, async (runtime, storage) => {
    await openRequiredLane(runtime, options.lane);
    const result = await handleSubstrateDoctor({ options, storage });
    return {
      ...result,
      human: stableStringify(result.payload),
    };
  });
}
