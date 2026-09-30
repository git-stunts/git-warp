/**
 * Session GC retains membership evidence until a retirement contract exists (#911).
 * StateSession owns no property registers, so this path currently reclaims nothing.
 */

import VersionVector from "../crdt/VersionVector.ts";
import WarpError from "../errors/WarpError.ts";
import type StateSession from "../orset/session/StateSession.ts";

import GCMetrics from "./GCMetrics.ts";
import GCExecuteResult from "./GCExecuteResult.ts";

export default async function executeGCInSession(
  session: StateSession,
  appliedVV: VersionVector,
): Promise<GCExecuteResult> {
  validateAppliedVersionVector(appliedVV);
  // Preserve closed-session validation through the supported session read path.
  await GCMetrics.fromSession(session);

  return new GCExecuteResult({
    nodesCompacted: 0,
    edgesCompacted: 0,
    tombstonesRemoved: 0,
    // A StateSession owns only the alive-set roots; the trie-backed substrate
    // holds no property registers for this path to reclaim.
    propertiesPruned: 0,
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
