import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import parseSourceAllowances, { UNREACHABLE_SOURCE_ALLOWLIST_PATH } from './parseSourceAllowances.ts';
import SourceHistoryRefusal from './SourceHistoryRefusal.ts';

// The 242-file inventory approved by #1054, plus the 13 retained-manifest files that
// main merged through #815 before this guard reached main.
const INITIAL_ALLOWANCE_COMMIT = 'be9d374f4419492420c002d7942a3480e584f949';
const GUARD_DIRECTORY = 'scripts/source-reachability/';
const GIT_TIMEOUT_MS = 10_000;
const GIT_OUTPUT_BYTES = 1_048_576;
const COMMIT_ID = /^[a-f0-9]{40,64}$/u;

/** Compares complete owner/path rows with the branch point; a missing basis never grants growth. */
export default class SourceAllowanceHistory {
  private readonly root: string;
  private readonly initialCommit: string;

  constructor(root: string, initialCommit: string = INITIAL_ALLOWANCE_COMMIT) {
    this.root = resolve(root);
    this.initialCommit = initialCommit;
    Object.freeze(this);
  }

  check(base: string): readonly string[] {
    const path = resolve(this.root, UNREACHABLE_SOURCE_ALLOWLIST_PATH);
    if (!existsSync(path)) return Object.freeze(['Current source allowance inventory is missing']);
    const current = parseSourceAllowances(readFileSync(path, 'utf8'));
    if (current.problems.length > 0) return current.problems;
    const previous = this.previous(base);
    if (previous instanceof SourceHistoryRefusal) return Object.freeze([previous.reason]);
    const accepted = parseSourceAllowances(previous);
    if (accepted.problems.length > 0) return Object.freeze(accepted.problems.map((problem) => `History: ${problem}`));
    return Object.freeze([...current.rows].filter((row) => !accepted.rows.has(row)).map((row) => `NEW allowance ${row}`));
  }

  private previous(base: string): string | SourceHistoryRefusal {
    const commit = this.branchPoint(base);
    if (commit instanceof SourceHistoryRefusal) return commit;
    const listing = this.git('ls-tree', '--name-only', commit, '--', UNREACHABLE_SOURCE_ALLOWLIST_PATH);
    if (listing instanceof SourceHistoryRefusal) return listing;
    return listing.trim() === '' ? this.initialIntroduction(commit) : this.readAt(commit);
  }

  private branchPoint(base: string): string | SourceHistoryRefusal {
    const shallow = this.git('rev-parse', '--is-shallow-repository');
    if (shallow instanceof SourceHistoryRefusal) return shallow;
    if (shallow.trim() !== 'false') return new SourceHistoryRefusal('Complete history is required for source allowances');
    const branchPoint = this.git('merge-base', '--all', '--', base, 'HEAD');
    if (branchPoint instanceof SourceHistoryRefusal) return branchPoint;
    const commit = branchPoint.trim();
    if (!COMMIT_ID.test(commit)) return new SourceHistoryRefusal('One unambiguous merge base is required for source allowances');
    return commit;
  }

  private initialIntroduction(commit: string): string | SourceHistoryRefusal {
    const history = this.git('log', '--full-history', '-1', '--format=%H', commit, '--', UNREACHABLE_SOURCE_ALLOWLIST_PATH, GUARD_DIRECTORY);
    if (history instanceof SourceHistoryRefusal) return history;
    if (history.trim() !== '') return new SourceHistoryRefusal('An earlier source allowance inventory or guard prevents reset');
    if (!COMMIT_ID.test(this.initialCommit)) return new SourceHistoryRefusal('An immutable initial source allowance commit is required');
    const ancestor = this.git('merge-base', '--is-ancestor', '--', this.initialCommit, 'HEAD');
    if (ancestor instanceof SourceHistoryRefusal) return ancestor;
    return this.readAt(this.initialCommit);
  }

  private readAt(commit: string): string | SourceHistoryRefusal {
    return this.git('show', `${commit}:${UNREACHABLE_SOURCE_ALLOWLIST_PATH}`);
  }

  private git(command: string, ...arguments_: readonly string[]): string | SourceHistoryRefusal {
    const result = spawnSync('git', [command, ...arguments_], {
      cwd: this.root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_OUTPUT_BYTES,
    });
    if (result.status !== 0) return new SourceHistoryRefusal(`Source allowance history inspection failed: ${command}`);
    return result.stdout;
  }
}
