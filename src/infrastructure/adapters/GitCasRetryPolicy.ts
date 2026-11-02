import type OperationPolicyPort from '../../ports/OperationPolicyPort.ts';
import type { OperationPolicyExecuteOptions } from '../../ports/OperationPolicyPort.ts';

/** The policy shape git-cas accepts for retrying its own Git operations. */
export interface GitCasRetryPolicy {
  execute<T>(operation: () => Promise<T>): Promise<T>;
}

/** Adapts git-warp retry options to git-cas's policy-shaped boundary. */
export function createGitCasRetryPolicy(
  policy: OperationPolicyPort,
  retryOptions: OperationPolicyExecuteOptions,
): GitCasRetryPolicy {
  return Object.freeze({
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      return await policy.execute(operation, retryOptions);
    },
  });
}
