import type { BranchUpdateDecision } from './BranchUpdateDecision.ts';
import BranchUpdateFailure from './BranchUpdateFailure.ts';
import BranchUpdateOutcome from './BranchUpdateOutcome.ts';
import type { BranchUpdateResult } from './BranchUpdateResult.ts';
import ConflictNotice from './ConflictNotice.ts';
import { HEAD_POLL, MERGEABILITY_POLL } from './PollSchedule.ts';
import type { PullRequestHostPort } from './PullRequestHostPort.ts';
import type PullRequestSnapshot from './PullRequestSnapshot.ts';
import ReportConflict from './ReportConflict.ts';
import selectBranchUpdates from './selectBranchUpdates.ts';
import SkipPullRequest from './SkipPullRequest.ts';
import SkipReason from './SkipReason.ts';
import UpdateBranch from './UpdateBranch.ts';
import type { WaitPort } from './WaitPort.ts';

const SHORT_OID_LENGTH = 9;

export type BranchUpdaterDependencies = {
  readonly host: PullRequestHostPort;
  readonly waiter: WaitPort;
  /** Workflow files to dispatch on each head that the updater moved. */
  readonly workflows: readonly string[];
};

/**
 * Merges the base into review-ready pull requests (#1131). `plan` reads
 * GitHub, `preview` reports the plan without a write, and `apply` carries
 * it out one pull request at a time.
 */
export default class BranchUpdater {
  readonly #host: PullRequestHostPort;
  readonly #waiter: WaitPort;
  readonly #workflows: readonly string[];

  constructor(dependencies: BranchUpdaterDependencies) {
    this.#host = dependencies.host;
    this.#waiter = dependencies.waiter;
    this.#workflows = Object.freeze([...dependencies.workflows]);
    Object.freeze(this);
  }

  /** Lists again while GitHub has not computed mergeability, within MERGEABILITY_POLL. */
  async plan(): Promise<readonly BranchUpdateDecision[]> {
    let decisions = selectBranchUpdates(await this.#host.listOpenPullRequests());
    for (let attempt = 1; attempt < MERGEABILITY_POLL.attempts && awaitsMergeability(decisions); attempt += 1) {
      await this.#waiter.wait(MERGEABILITY_POLL.intervalMs);
      decisions = selectBranchUpdates(await this.#host.listOpenPullRequests());
    }
    return decisions;
  }

  /** Dry run: reads comments to report notices, and writes nothing. */
  async preview(decisions: readonly BranchUpdateDecision[]): Promise<readonly BranchUpdateResult[]> {
    const results: BranchUpdateResult[] = [];
    for (const decision of decisions) {
      results.push(await this.#previewOne(decision));
    }
    return results;
  }

  /** One pull request at a time: the next update starts after the previous dispatch. */
  async apply(decisions: readonly BranchUpdateDecision[]): Promise<readonly BranchUpdateResult[]> {
    const results: BranchUpdateResult[] = [];
    for (const decision of decisions) {
      results.push(await this.#applyOne(decision));
    }
    return results;
  }

  #previewOne(decision: BranchUpdateDecision): Promise<BranchUpdateResult> {
    const pullRequest = decision.pullRequest;
    if (decision instanceof UpdateBranch) {
      const dispatch = `dispatch ${this.#workflows.join(', ')}`;
      return Promise.resolve(outcome(pullRequest, `would merge ${behindSummary(pullRequest)} and ${dispatch}`));
    }
    if (decision instanceof ReportConflict) {
      return this.#reportConflict(pullRequest, () => Promise.resolve('would post a conflict notice'));
    }
    return Promise.resolve(skipped(decision));
  }

  #applyOne(decision: BranchUpdateDecision): Promise<BranchUpdateResult> {
    const pullRequest = decision.pullRequest;
    if (decision instanceof UpdateBranch) {
      return this.#update(pullRequest);
    }
    if (decision instanceof ReportConflict) {
      return this.#reportConflict(pullRequest, (notice) => this.#postNotice(pullRequest, notice));
    }
    return Promise.resolve(skipped(decision));
  }

  async #reportConflict(
    pullRequest: PullRequestSnapshot,
    post: (notice: ConflictNotice) => Promise<string>,
  ): Promise<BranchUpdateResult> {
    const notice = new ConflictNotice(pullRequest);
    const conflict = `conflicts with ${pullRequest.baseRefName}`;
    const posted = notice.isPostedIn(await this.#host.listCommentBodies(pullRequest.number));
    const summary = posted ? `notice already posted for head ${shortOid(pullRequest.headOid)}` : await post(notice);
    return outcome(pullRequest, `${conflict}; ${summary}`);
  }

  async #postNotice(pullRequest: PullRequestSnapshot, notice: ConflictNotice): Promise<string> {
    await this.#host.createComment(pullRequest.number, notice.body);
    return 'posted a conflict notice';
  }

  async #update(pullRequest: PullRequestSnapshot): Promise<BranchUpdateResult> {
    try {
      await this.#host.updateBranch(pullRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure(pullRequest, `could not merge ${pullRequest.baseRefName}: ${message}`);
    }
    const newHead = await this.#awaitNewHead(pullRequest);
    if (newHead === null) {
      const waited = `the head did not move within ${HEAD_POLL.budgetMs} ms`;
      return failure(pullRequest, `GitHub accepted the update, but ${waited}; no workflow dispatched`);
    }
    return this.#dispatch(pullRequest, newHead);
  }

  async #awaitNewHead(pullRequest: PullRequestSnapshot): Promise<string | null> {
    for (let attempt = 0; attempt < HEAD_POLL.attempts; attempt += 1) {
      await this.#waiter.wait(HEAD_POLL.intervalMs);
      const head = await this.#host.readHeadOid(pullRequest.number);
      if (head !== pullRequest.headOid) {
        return head;
      }
    }
    return null;
  }

  async #dispatch(pullRequest: PullRequestSnapshot, newHead: string): Promise<BranchUpdateResult> {
    const head = `new head ${shortOid(newHead)}`;
    for (const workflow of this.#workflows) {
      try {
        await this.#host.dispatchWorkflow(workflow, pullRequest.headRefName);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const merged = `merged ${pullRequest.baseRefName} into ${pullRequest.headRefName} (${head})`;
        return failure(pullRequest, `${merged}, but could not dispatch ${workflow}: ${message}`);
      }
    }
    const dispatched = `dispatched ${this.#workflows.join(', ')}`;
    return outcome(pullRequest, `merged ${behindSummary(pullRequest)}; ${head}; ${dispatched}`);
  }
}

function awaitsMergeability(decisions: readonly BranchUpdateDecision[]): boolean {
  return decisions.some((decision) => decision instanceof SkipPullRequest && decision.reason === SkipReason.UNKNOWN_MERGEABILITY);
}

function behindSummary(pullRequest: PullRequestSnapshot): string {
  const commits = pullRequest.behindBy === 1 ? 'commit' : 'commits';
  return `${pullRequest.baseRefName} (${pullRequest.behindBy} ${commits} behind) into ${pullRequest.headRefName}`;
}

function skipped(decision: SkipPullRequest): BranchUpdateOutcome {
  return outcome(decision.pullRequest, `skipped: ${decision.reason.label}`);
}

function outcome(pullRequest: PullRequestSnapshot, summary: string): BranchUpdateOutcome {
  return new BranchUpdateOutcome(pullRequest.number, summary);
}

function failure(pullRequest: PullRequestSnapshot, reason: string): BranchUpdateFailure {
  return new BranchUpdateFailure(pullRequest.number, reason);
}

function shortOid(oid: string): string {
  return oid.slice(0, SHORT_OID_LENGTH);
}
