import { requireStrandId } from '../crdt/StrandId.ts';
import { REF_PREFIX, validateGraphName } from './RefLayout.ts';

/**
 * Ref layout of a lane's clone-local cone bases (#1039). Every ref here is
 * derived state, rebuilt from writer chains and never transferred:
 *
 * - refs/warp/<graph>/cone/head
 * - refs/warp/<graph>/cone/retained
 * - refs/warp/<graph>/cone/strands/<id>/base
 * - refs/warp/<graph>/cone/strands/<id>/head
 *
 * @module domain/utils/ConeRefLayout
 */

/**
 * Builds the cone basis head ref path for the given graph (#1039). Like the
 * checkpoint head it is derived, clone-local and never transferred.
 *
 * @example
 * buildConeHeadRef('events');
 * // => 'refs/warp/events/cone/head'
 */
export function buildConeHeadRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/cone/head`;
}

/**
 * Builds the ref that keeps this clone's recently captured cone bases
 * reachable (#1039), so a saved Coordinate survives `git gc --prune=now`.
 * Derived, clone-local and never transferred.
 *
 * @example
 * buildConeRetainedRef('events');
 * // => 'refs/warp/events/cone/retained'
 */
export function buildConeRetainedRef(graphName: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/cone/retained`;
}

/** Builds the prefix of one strand's clone-local cone basis refs (#1039). */
export function buildConeStrandPrefix(graphName: string, strandId: string): string {
  validateGraphName(graphName);
  return `${REF_PREFIX}/${graphName}/cone/strands/${requireStrandId(strandId)}/`;
}

/** Builds the ref pinning the cone basis a strand was forked from (#1039). */
export function buildConeStrandBaseRef(graphName: string, strandId: string): string {
  return `${buildConeStrandPrefix(graphName, strandId)}base`;
}

/** Builds the ref of a strand's cone basis: its base plus its own patches (#1039). */
export function buildConeStrandHeadRef(graphName: string, strandId: string): string {
  return `${buildConeStrandPrefix(graphName, strandId)}head`;
}
