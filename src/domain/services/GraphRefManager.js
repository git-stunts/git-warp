import { performance } from 'perf_hooks';
import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';

/**
 * Domain service for managing graph ref reachability.
 *
 * This service implements the core durability contract for EmptyGraph by ensuring
 * that commits remain reachable from the graph ref and are not subject to Git
 * garbage collection.
 *
 * Key responsibilities:
 * - Reading and updating the graph ref
 * - Creating anchor commits when needed to maintain reachability
 * - Implementing the sync algorithm from SEMANTICS.md
 *
 * @example
 * // Basic usage
 * const refManager = new GraphRefManager({ persistence: gitAdapter });
 * const result = await refManager.syncHead('refs/empty-graph/index', newCommitSha);
 *
 * @example
 * // With logging enabled
 * const refManager = new GraphRefManager({ persistence: gitAdapter, logger: consoleLogger });
 */
export default class GraphRefManager {
  /**
   * Creates a new GraphRefManager instance.
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.persistence - Persistence adapter implementing GraphPersistencePort.
   *   Required methods: readRef, updateRef, commitNode
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging.
   *   Defaults to NoOpLogger (no logging). Inject ConsoleLogger or custom logger for output.
   */
  constructor({ persistence, logger = new NoOpLogger() }) {
    if (!persistence) {
      throw new Error('GraphRefManager requires a persistence adapter');
    }
    this.persistence = persistence;
    this.logger = logger;
  }

  /**
   * Reads the current SHA that a ref points to.
   *
   * @param {string} ref - The ref name (e.g., 'refs/empty-graph/index')
   * @returns {Promise<string|null>} The SHA the ref points to, or null if ref doesn't exist
   *
   * @example
   * const sha = await refManager.readHead('refs/empty-graph/index');
   * if (sha) {
   *   console.log(`Current tip: ${sha}`);
   * } else {
   *   console.log('Ref does not exist yet');
   * }
   */
  async readHead(ref) {
    const startTime = performance.now();
    const sha = await this.persistence.readRef(ref);
    const durationMs = performance.now() - startTime;

    this.logger.debug('Read head', {
      operation: 'readHead',
      ref,
      sha,
      exists: sha !== null,
      durationMs,
    });

    return sha;
  }

  /**
   * Synchronizes the ref to include a new commit, ensuring reachability.
   *
   * Implements the sync algorithm from SEMANTICS.md:
   * 1. If ref does not exist: create ref pointing to newTipSha
   * 2. If ref already points to newTipSha: no-op (returns updated: false)
   * 3. If ref tip is ancestor of newTipSha: fast-forward ref to newTipSha
   * 4. Otherwise: create anchor commit with parents [ref_tip, newTipSha], update ref to anchor
   *
   * Uses persistence.isAncestor() for fast-forward detection, which delegates to
   * `git merge-base --is-ancestor` to check reachability.
   *
   * @param {string} ref - The ref name to sync (e.g., 'refs/empty-graph/index')
   * @param {string} newTipSha - The SHA of the commit that needs to become reachable
   * @returns {Promise<{updated: boolean, anchor: boolean, sha: string}>} Sync result:
   *   - updated: true if ref was changed, false if already at target
   *   - anchor: true if an anchor commit was created, false if direct update or no-op
   *   - sha: the SHA the ref now points to (either newTipSha or the anchor SHA)
   *
   * @example
   * // First write to a new graph
   * const result = await refManager.syncHead('refs/empty-graph/index', firstCommitSha);
   * // result: { updated: true, anchor: false, sha: firstCommitSha }
   *
   * @example
   * // Write that requires an anchor
   * const result = await refManager.syncHead('refs/empty-graph/index', disconnectedCommitSha);
   * // result: { updated: true, anchor: true, sha: anchorSha }
   */
  async syncHead(ref, newTipSha) {
    const startTime = performance.now();
    const currentTip = await this.readHead(ref);

    if (!currentTip) {
      // No ref exists - create it
      await this.persistence.updateRef(ref, newTipSha);
      const durationMs = performance.now() - startTime;
      this.logger.debug('Ref created', {
        operation: 'syncHead',
        ref,
        sha: newTipSha,
        anchor: false,
        durationMs,
      });
      return { updated: true, anchor: false, sha: newTipSha };
    }

    if (currentTip === newTipSha) {
      // Already pointing here
      return { updated: false, anchor: false, sha: currentTip };
    }

    // NEW: Fast-forward check - if current tip is ancestor of new commit, just move ref
    if (await this.persistence.isAncestor(currentTip, newTipSha)) {
      await this.persistence.updateRef(ref, newTipSha);
      const durationMs = performance.now() - startTime;
      this.logger.debug('Ref fast-forwarded', {
        operation: 'syncHead',
        ref,
        sha: newTipSha,
        previousTip: currentTip,
        anchor: false,
        durationMs,
      });
      return { updated: true, anchor: false, sha: newTipSha };
    }

    // Divergent history - create anchor
    const anchorSha = await this.createAnchor([currentTip, newTipSha]);
    await this.persistence.updateRef(ref, anchorSha);
    const durationMs = performance.now() - startTime;
    this.logger.debug('Anchor created', {
      operation: 'syncHead',
      ref,
      sha: anchorSha,
      parents: [currentTip, newTipSha],
      anchor: true,
      durationMs,
    });
    return { updated: true, anchor: true, sha: anchorSha };
  }

  /**
   * Creates an anchor commit that unifies multiple parent commits.
   *
   * Anchor commits are internal bookkeeping to maintain reachability.
   * They have a special payload marker and should be transparent to
   * graph traversal operations.
   *
   * @param {string[]} parents - Array of parent SHAs to include in the anchor
   * @returns {Promise<string>} The SHA of the created anchor commit
   *
   * @example
   * // Create anchor unifying old tip and new disconnected commit
   * const anchorSha = await refManager.createAnchor([oldTipSha, newCommitSha]);
   */
  async createAnchor(parents) {
    const startTime = performance.now();

    // Anchor commits have a JSON payload marking their type
    const message = JSON.stringify({ _type: 'anchor' });

    const anchorSha = await this.persistence.commitNode({
      message,
      parents,
    });

    const durationMs = performance.now() - startTime;
    this.logger.debug('Anchor created', {
      operation: 'createAnchor',
      anchorSha,
      parentCount: parents.length,
      parents,
      durationMs,
    });

    return anchorSha;
  }

  /**
   * Checks if potentialAncestor is reachable from descendant.
   *
   * @deprecated This method is no longer used by syncHead(), which now delegates
   * directly to persistence.isAncestor(). This stub remains for backwards
   * compatibility but always returns false.
   *
   * @param {string} potentialAncestor - SHA to check as potential ancestor
   * @param {string} descendant - SHA to check as potential descendant
   * @returns {Promise<boolean>} Always returns false (stub implementation)
   */
  async isAncestor(potentialAncestor, descendant) {
    this.logger.debug('isAncestor stub called (always returns false)', {
      operation: 'isAncestor',
      potentialAncestor,
      descendant,
      result: false,
    });

    return false;
  }
}
