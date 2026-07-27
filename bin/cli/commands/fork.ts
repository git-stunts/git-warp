import { z } from 'zod';

import { parseCommandArgs } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { openRequiredLane, withRuntime } from '../v19/V19Runtime.ts';
import type Runtime from '../../../src/application/Runtime.ts';
import type Lane from '../../../src/domain/api/Lane.ts';
import type { McpJsonValue } from './mcp/McpJsonValue.ts';

const FORK_OPTIONS = {
  name: { type: 'string' },
};

const FORK_SCHEMA = z.object({
  name: z.string().min(1),
});

export default async function handleFork({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<{
  readonly payload: McpJsonValue;
  readonly human: string;
}> {
  const { values } = parseCommandArgs(
    args,
    FORK_OPTIONS,
    FORK_SCHEMA,
  );
  return await withRuntime(
    options,
    async (runtime) =>
      await forkLane(runtime, options.lane, values.name),
  );
}

async function forkLane(
  runtime: Runtime,
  laneName: string | null,
  forkName: string,
) {
  const source = await openRequiredLane(runtime, laneName);
  const fork = await runtime.fork(source, { name: forkName });
  return forkResult(source, fork);
}

function forkResult(source: Lane, fork: Lane) {
  const payload: McpJsonValue = Object.freeze({
    type: 'Lane',
    kind: fork.kind,
    name: fork.name,
    writer: fork.writer,
    source: source.reference,
  });
  return {
    payload,
    human: [
      `Lane: ${fork.name}`,
      `kind: ${fork.kind}`,
      `source: ${source.name}`,
      `writer: ${fork.writer}`,
    ].join('\n'),
  };
}
