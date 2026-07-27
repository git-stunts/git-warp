import Runtime from '../../../src/application/Runtime.ts';
import { resolveRuntimeStorage } from '../../../src/application/RuntimeStorageAccess.ts';
import type Lane from '../../../src/domain/api/Lane.ts';
import { usageError } from '../infrastructure.ts';
import {
  requireCliStorageBinding,
  type CliStorageBinding,
} from '../shared.ts';
import type { CliOptions } from '../types.ts';

export type RuntimeTask<TResult> = (
  runtime: Runtime,
  storage: CliStorageBinding,
) => Promise<TResult>;

export async function withRuntime<TResult>(
  options: Pick<CliOptions, 'repo' | 'writer'>,
  task: RuntimeTask<TResult>,
): Promise<TResult> {
  const runtime = await Runtime.open({
    at: options.repo,
    writer: options.writer,
  });
  try {
    const storage = requireCliStorageBinding(resolveRuntimeStorage(runtime));
    return await task(runtime, storage);
  } finally {
    await runtime.close();
  }
}

export async function openRequiredLane(
  runtime: Runtime,
  laneName: string | null,
  strandName: string | null = null,
): Promise<Lane> {
  if (laneName === null || laneName.length === 0) {
    throw usageError('--lane <name> is required');
  }
  const lane = await runtime.lane(laneName);
  return strandName === null
    ? lane
    : await runtime.strand(lane, { name: strandName });
}
