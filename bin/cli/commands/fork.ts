import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs } from '../infrastructure.ts';
import { openGraph } from '../shared.ts';
import type { CliOptions } from '../types.ts';

const FORK_OPTIONS = {
  from: { type: 'string' },
  at: { type: 'string' },
  'fork-name': { type: 'string' },
  'fork-writer': { type: 'string' },
};

const forkSchema = z.object({
  from: z.string().min(1, 'Missing value for --from'),
  at: z.string().min(1, 'Missing value for --at'),
  'fork-name': z.string().min(1, 'Missing value for --fork-name').optional(),
  'fork-writer': z.string().min(1, 'Missing value for --fork-writer').optional(),
}).strict().transform((val) => ({
  from: val.from,
  at: val.at,
  forkName: val['fork-name'] ?? null,
  forkWriter: val['fork-writer'] ?? null,
}));

type ForkPayload = {
  graph: string;
  forkGraph: string;
  forkWriter: string;
  from: string;
  at: string;
  status: 'created';
};

export default async function handleFork(
  { options, args }: { options: CliOptions; args: string[] },
): Promise<{ payload: ForkPayload; exitCode: number }> {
  const { values } = parseCommandArgs(args, FORK_OPTIONS, forkSchema);
  const { graph, graphName } = await openGraph(options);
  const forked = await graph.fork({
    from: values.from,
    at: values.at,
    ...(values.forkName !== null ? { forkName: values.forkName } : {}),
    ...(values.forkWriter !== null ? { forkWriterId: values.forkWriter } : {}),
  });

  return {
    payload: {
      graph: graphName,
      forkGraph: forked.graphName,
      forkWriter: forked.writerId,
      from: values.from,
      at: values.at,
      status: 'created',
    },
    exitCode: EXIT_CODES.OK,
  };
}
