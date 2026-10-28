import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { openRequiredLane, withRuntime } from '../v19/V19Runtime.ts';
import { stableStringify } from '../../presenters/json.ts';
import advanceConeBasis from './ConeBasisRepair.ts';
import prepareMaterialization from './MaterializationRepair.ts';

const REPAIR_OPTIONS = {
  action: { type: 'string' },
};

/**
 * `basis` advances the lane's cone basis, which is all public reads and
 * writes need. `materialization` is global maintenance: it reduces the whole
 * graph and writes a whole-state checkpoint, and no public read needs it.
 */
const REPAIR_SCHEMA = z.object({
  action: z.enum(['basis', 'materialization']),
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
  const { action } = parseCommandArgs(args, REPAIR_OPTIONS, REPAIR_SCHEMA).values;
  return await withRuntime(options, async (runtime) => {
    if (action === 'materialization') {
      const lane = await openRequiredLane(runtime, options.lane);
      const payload = await prepareMaterialization(options, lane.name);
      return { payload, human: stableStringify(payload), exitCode: EXIT_CODES.OK };
    }
    const payload = await advanceConeBasis(await openRequiredLane(runtime, options.lane, options.strand));
    return {
      payload,
      human: stableStringify(payload),
      exitCode: payload.status === 'completed' ? EXIT_CODES.OK : EXIT_CODES.INTERNAL,
    };
  });
}
