import GitPlumbing from '@git-stunts/plumbing';

/**
 * Counts Git processes started through `@git-stunts/plumbing`.
 *
 * Every Git process git-warp and git-cas start goes through
 * `GitPlumbing.prototype.executeStream` (one-shot commands; `execute` calls
 * it) or `GitPlumbing.prototype.openSession` (long-lived cat-file, mktree,
 * fast-import and update-ref sessions). The counter wraps those two methods
 * once, before the Runtime is opened, the same process boundary that
 * scripts/performance/PerformanceRuntime.ts `CountingPlumbing` counts. It
 * observes the public `Runtime`; it does not reach into git-warp.
 */

type CommandOptions = Readonly<{ args: readonly string[] }>;
type PlumbingMethod = (this: object, options: CommandOptions) => Promise<object>;
type PlumbingPrototype = { executeStream: PlumbingMethod; openSession: PlumbingMethod };

export type GitProcessSnapshot = Readonly<{ total: number; byCommand: Readonly<Record<string, number>> }>;

class GitProcessCounter {
  #total = 0;
  readonly #byCommand = new Map<string, number>();

  install(prototype: PlumbingPrototype): void {
    const counter = this;
    const executeStream = prototype.executeStream;
    const openSession = prototype.openSession;
    prototype.executeStream = function countedExecuteStream(options) {
      counter.#record(options.args[0] ?? '<empty>');
      return executeStream.call(this, options);
    };
    prototype.openSession = function countedOpenSession(options) {
      counter.#record(`session:${options.args[0] ?? '<empty>'}`);
      return openSession.call(this, options);
    };
  }

  snapshot(): GitProcessSnapshot {
    return Object.freeze({ total: this.#total, byCommand: Object.freeze(Object.fromEntries(this.#byCommand)) });
  }

  /** Processes started since `before`, by command. */
  since(before: GitProcessSnapshot): GitProcessSnapshot {
    const byCommand: Record<string, number> = {};
    for (const [command, count] of this.#byCommand) {
      const delta = count - (before.byCommand[command] ?? 0);
      if (delta > 0) {
        byCommand[command] = delta;
      }
    }
    return Object.freeze({ total: this.#total - before.total, byCommand: Object.freeze(byCommand) });
  }

  #record(command: string): void {
    this.#total += 1;
    this.#byCommand.set(command, (this.#byCommand.get(command) ?? 0) + 1);
  }
}

const counter = new GitProcessCounter();
counter.install(GitPlumbing.prototype);

export default counter;
