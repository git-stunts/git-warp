import { GitBatchReadWindow } from './GitBatchReadWindow.ts';
import { MachineLocalPathPolicy } from './MachineLocalPathPolicy.ts';

export class GitBatchBlobStreamScanner {
  constructor(
    _source: AsyncIterable<Uint8Array>,
    _policy: MachineLocalPathPolicy,
    _readWindow: GitBatchReadWindow
  ) {}

  findLeakingBlobIds(_expectedObjectIds: readonly string[]): Promise<Set<string>> {
    return Promise.reject(new Error('Git batch blob stream scanner is not implemented'));
  }
}
