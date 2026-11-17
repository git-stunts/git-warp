import type { PullRequestHostPort } from '../../../../scripts/pr-branch-update/PullRequestHostPort.ts';
import type PullRequestSnapshot from '../../../../scripts/pr-branch-update/PullRequestSnapshot.ts';

/** The head that the fake gives PR `number` after it merges the base. */
export function mergedHeadOid(number: number): string {
  return number.toString(16).padStart(40, 'f');
}

/**
 * An owned in-memory GitHub for the updater tests. It records every write
 * and every listing in `events`, in call order, so a test can assert what
 * crossed the port and in which order. Reads of a head are not recorded.
 *
 * Drift risk: the real adapter (GhCliPullRequestHost) is exercised by the
 * read-only dry run against the live repository and by the first workflow
 * run on main; this fake models only the outcomes those paths return.
 */
export default class InMemoryPullRequestHost implements PullRequestHostPort {
  readonly events: string[] = [];
  readonly #listings: readonly (readonly PullRequestSnapshot[])[];
  readonly #heads = new Map<number, string>();
  readonly #comments = new Map<number, string[]>();
  readonly #refusedUpdates = new Set<number>();
  readonly #stillHeads = new Set<number>();
  readonly #refusedDispatches = new Set<string>();
  #listingIndex = 0;

  constructor(listings: readonly (readonly PullRequestSnapshot[])[]) {
    this.#listings = listings;
  }

  refuseUpdate(number: number): void {
    this.#refusedUpdates.add(number);
  }

  keepHeadStill(number: number): void {
    this.#stillHeads.add(number);
  }

  refuseDispatch(workflowFile: string): void {
    this.#refusedDispatches.add(workflowFile);
  }

  addComment(number: number, body: string): void {
    this.#comments.set(number, [...(this.#comments.get(number) ?? []), body]);
  }

  commentsOn(number: number): readonly string[] {
    return this.#comments.get(number) ?? [];
  }

  listOpenPullRequests(): Promise<readonly PullRequestSnapshot[]> {
    this.events.push('list');
    const listing = this.#listings[Math.min(this.#listingIndex, this.#listings.length - 1)] ?? [];
    this.#listingIndex += 1;
    for (const pullRequest of listing) {
      this.#heads.set(pullRequest.number, pullRequest.headOid);
    }
    return Promise.resolve(listing);
  }

  updateBranch(pullRequest: PullRequestSnapshot): Promise<void> {
    this.events.push(`update #${pullRequest.number}`);
    if (this.#refusedUpdates.has(pullRequest.number)) {
      return Promise.reject(new Error('HTTP 422: merge conflict between base and head'));
    }
    if (!this.#stillHeads.has(pullRequest.number)) {
      this.#heads.set(pullRequest.number, mergedHeadOid(pullRequest.number));
    }
    return Promise.resolve();
  }

  readHeadOid(pullRequestNumber: number): Promise<string> {
    return Promise.resolve(this.#heads.get(pullRequestNumber) ?? '');
  }

  dispatchWorkflow(workflowFile: string, ref: string): Promise<void> {
    this.events.push(`dispatch ${workflowFile} on ${ref}`);
    if (this.#refusedDispatches.has(workflowFile)) {
      return Promise.reject(new Error(`HTTP 422: Workflow does not have 'workflow_dispatch' trigger`));
    }
    return Promise.resolve();
  }

  listCommentBodies(pullRequestNumber: number): Promise<readonly string[]> {
    return Promise.resolve(this.commentsOn(pullRequestNumber));
  }

  createComment(pullRequestNumber: number, body: string): Promise<void> {
    this.events.push(`comment #${pullRequestNumber}`);
    this.addComment(pullRequestNumber, body);
    return Promise.resolve();
  }
}
