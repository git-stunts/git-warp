import WarpError from '../../errors/WarpError.ts';

/**
 * Commits one sweep's publication probes may still read (#1075). Probes spend it as
 * they read, so a Warp's one sweep, inside its first granted `execute` or `reconcile`, reads
 * a bounded amount of writer history however many unresolved attempts it finds.
 */
export default class WriteReadBudget {
  #remaining: number;

  constructor(commits: number) {
    if (!Number.isSafeInteger(commits) || commits < 0) {
      throw new WarpError('A write read budget must be a count of commits', 'E_WRITE_READ_BUDGET');
    }
    this.#remaining = commits;
    Object.freeze(this);
  }

  /** Whether `commits` more reads fit in what is left. */
  affords(commits: number): boolean {
    return commits <= this.#remaining;
  }

  /** Charges commits already read; what is left never goes below nothing. */
  spend(commits: number): void {
    this.#remaining = Math.max(0, this.#remaining - commits);
  }
}
