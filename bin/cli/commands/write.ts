import { z } from 'zod';

import { parseCommandArgs } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { intentFromText } from '../v19/V19DomainInput.ts';
import { openRequiredLane, withRuntime } from '../v19/V19Runtime.ts';
import {
  receiptEnvelope,
  renderReceipt,
} from '../../presenters/V19ReadingReceipt.ts';

const WRITE_OPTIONS = {
  intent: { type: 'string' },
};

const WRITE_SCHEMA = z.object({
  intent: z.string().min(1),
});

export default async function handleWrite({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<{
  readonly payload: ReturnType<typeof receiptEnvelope>;
  readonly human: string;
}> {
  const { values } = parseCommandArgs(
    args,
    WRITE_OPTIONS,
    WRITE_SCHEMA,
  );
  const receipt = await withRuntime(options, async (runtime) => {
    const lane = await openRequiredLane(
      runtime,
      options.lane,
      options.strand,
    );
    return await lane.write(intentFromText(values.intent));
  });
  const payload = receiptEnvelope(receipt);
  return {
    payload,
    human: renderReceipt(payload),
  };
}
