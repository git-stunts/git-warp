import { z } from 'zod';

import { parseCommandArgs } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { openRequiredLane, withRuntime } from '../v19/V19Runtime.ts';
import { stableStringify } from '../../presenters/json.ts';
import prepareMaterialization from './MaterializationRepair.ts';

const REPAIR_OPTIONS = {
  action: { type: 'string' },
};

const REPAIR_SCHEMA = z.object({
  action: z.literal('materialization'),
});

export default async function handleRepair({
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
  parseCommandArgs(args, REPAIR_OPTIONS, REPAIR_SCHEMA);
  return await withRuntime(options, async (runtime) => {
    const lane = await openRequiredLane(runtime, options.lane);
    const payload = await prepareMaterialization(options, lane.name);
    return {
      payload,
      human: stableStringify(payload),
      exitCode: 0,
    };
  });
}
