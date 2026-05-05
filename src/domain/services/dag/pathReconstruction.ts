/**
 * Path reconstruction helpers for DAG path-finding algorithms.
 *
 * Pure functions that walk predecessor/successor maps to rebuild
 * paths after BFS, Dijkstra, A*, or bidirectional searches.
 *
 * @module domain/services/dag/pathReconstruction
 */

import type LoggerPort from '../../../ports/LoggerPort.ts';

/** Walks a predecessor map backward from `to` to `from`. */
function walkPredecessors(
  map: ReadonlyMap<string, string>,
  from: string,
  to: string,
  logger: LoggerPort,
  context: string,
): string[] {
  const path = [to];
  let current = to;
  while (current !== from) {
    const prev = map.get(current);
    if (prev === undefined) {
      logger.error(`${context} reconstruction failed: missing predecessor`, { from, to, current });
      break;
    }
    current = prev;
    path.unshift(current);
  }
  return path;
}

/** Walks a successor map forward from `from` to `to`. */
function walkSuccessors(
  map: ReadonlyMap<string, string>,
  from: string,
  to: string,
  logger: LoggerPort,
  context: string,
): string[] {
  const path = [from];
  let current = from;
  while (current !== to) {
    const next = map.get(current);
    if (next === undefined) {
      logger.error(`${context} reconstruction failed: missing successor`, { from, to, current });
      break;
    }
    current = next;
    path.push(current);
  }
  return path;
}

/** Reconstructs a path from bidirectional BFS parent maps. */
function reconstructBidirectionalBfs(
  fwdParent: ReadonlyMap<string, string>,
  bwdParent: ReadonlyMap<string, string>,
  from: string,
  to: string,
  meeting: string,
): string[] {
  const path = [meeting];
  let current = meeting;
  while (fwdParent.has(current)) {
    current = fwdParent.get(current)!;
    path.unshift(current);
  }
  if (path[0] !== from) {
    path.unshift(from);
  }
  current = meeting;
  while (bwdParent.has(current)) {
    current = bwdParent.get(current)!;
    path.push(current);
  }
  if (path[path.length - 1] !== to) {
    path.push(to);
  }
  return path;
}

/** Reconstructs a path from bidirectional A* predecessor + successor maps. */
function reconstructBidirectionalAStar(
  fwdPrevious: ReadonlyMap<string, string>,
  bwdNext: ReadonlyMap<string, string>,
  from: string,
  to: string,
  meeting: string,
  logger: LoggerPort,
): string[] {
  const forwardPath = walkPredecessors(fwdPrevious, from, meeting, logger, 'Forward path');
  const backwardPath = walkSuccessors(bwdNext, meeting, to, logger, 'Backward path');
  return forwardPath.concat(backwardPath.slice(1));
}

export {
  walkPredecessors,
  walkSuccessors,
  reconstructBidirectionalBfs,
  reconstructBidirectionalAStar,
};
