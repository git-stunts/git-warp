import PrBranchUpdateError from './PrBranchUpdateError.ts';

/** How often, and how many times, the updater polls GitHub for a change. */
export default class PollSchedule {
  readonly attempts: number;
  readonly intervalMs: number;

  constructor(attempts: number, intervalMs: number) {
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new PrBranchUpdateError(`poll attempts must be a positive integer, got ${attempts}`);
    }
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
      throw new PrBranchUpdateError(`poll interval must be a non-negative integer, got ${intervalMs}`);
    }
    this.attempts = attempts;
    this.intervalMs = intervalMs;
    Object.freeze(this);
  }

  get budgetMs(): number {
    return this.attempts * this.intervalMs;
  }
}

/** GitHub recomputes mergeability after each push to the base; about one minute. */
export const MERGEABILITY_POLL = new PollSchedule(6, 10_000);

/** update-branch answers 202 before the merge commit lands; up to one minute. */
export const HEAD_POLL = new PollSchedule(30, 2_000);
