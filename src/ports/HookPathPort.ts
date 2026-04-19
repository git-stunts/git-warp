/**
 * Port for resolving the effective Git hooks directory for a repository.
 *
 * This boundary owns Git-backed discovery such as `core.hooksPath` and
 * `rev-parse --git-dir`. Domain services use the resolved hooks directory
 * and remain unaware of the Git config mechanics behind it.
 */
export default abstract class HookPathPort {
  /** Resolves the effective hooks directory for the given repository path. */
  abstract resolveHooksDir(_repoPath: string): Promise<string>;
}
