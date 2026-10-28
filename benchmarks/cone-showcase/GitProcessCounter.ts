/// <reference path="../../test/type-check/plumbing-declarations.d.ts" />
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

export type GitProcessSnapshot = Readonly<{ total: number; byCommand: Readonly<Record<string, number>> }>;

class GitProcessCounter {
  #total = 0;
  readonly #byCommand = new Map<string, number>();

  /** Wraps one process-starting method of the plumbing prototype. */
  wrap(prototype: object, method: 'executeStream' | 'openSession', category: (command: string) => string): void {
    const original: unknown = Reflect.get(prototype, method);
    if (typeof original !== 'function') {
      throw new TypeError(`@git-stunts/plumbing no longer exposes ${method}`);
    }
    const record = (command: string): void => { this.#record(category(command)); };
    Reflect.set(prototype, method, function counted(this: object, options: CommandOptions): unknown {
      record(options.args[0] ?? '<empty>');
      return Reflect.apply(original, this, [options]);
    });
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
counter.wrap(GitPlumbing.prototype, 'executeStream', (command) => command);
counter.wrap(GitPlumbing.prototype, 'openSession', (command) => `session:${command}`);

export default counter;
