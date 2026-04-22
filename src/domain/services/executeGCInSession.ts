/**
 * executeGCInSession — compacts trie-backed alive sets through StateSession.
 *
 * Mirrors the legacy synchronous GC contract while keeping the trie-backed
 * substrate honest: metrics are read through session scans and compaction
 * happens through session-owned state access.
 *
 * @module domain/services/executeGCInSession
 */

import VersionVector from "../crdt/VersionVector.ts";
import WarpError from "../errors/WarpError.ts";
import StateSession from "../orset/session/StateSession.ts";

import GCMetrics from "./GCMetrics.ts";
import GCExecuteResult from "./GCExecuteResult.ts";

export default async function executeGCInSession(
  session: StateSession,
  appliedVV: VersionVector,
): Promise<GCExecuteResult> {
  validateAppliedVersionVector(appliedVV);
  const beforeMetrics = await GCMetrics.fromSession(session);
  await compactSession(session, appliedVV);
  const afterMetrics = await GCMetrics.fromSession(session);

  return new GCExecuteResult({
    nodesCompacted: beforeMetrics.nodeEntries - afterMetrics.nodeEntries,
    edgesCompacted: beforeMetrics.edgeEntries - afterMetrics.edgeEntries,
    tombstonesRemoved: beforeMetrics.totalTombstones - afterMetrics.totalTombstones,
  });
}

function validateAppliedVersionVector(appliedVV: VersionVector): void {
  if (!(appliedVV instanceof VersionVector)) {
    throw new WarpError(
      "executeGCInSession requires appliedVV to be a VersionVector",
      "E_GC_INVALID_VV",
    );
  }
}

async function compactSession(
  session: StateSession,
  appliedVV: VersionVector,
): Promise<void> {
  try {
    await session.compact(appliedVV);
  } catch (error) {
    if (error instanceof WarpError && error.code === "E_STATE_SESSION_CLOSED") {
      throw error;
    }
    throw new WarpError(
      "GC compaction failed during session phase",
      "E_GC_COMPACT_FAILED",
      { context: { phase: "session" } },
    );
  }
}
