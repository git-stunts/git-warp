export const READINGS_AND_OPTICS_DOC_PATH = 'docs/READINGS_AND_OPTICS.md';

export const E_NO_STATE_MSG = `No live reading basis is available for this operation. Open a worldline with graph.query.worldline(), choose a pinned coordinate, or use a checkpoint-backed reading before requesting this operation. See ${READINGS_AND_OPTICS_DOC_PATH}.`;

export const E_STALE_STATE_MSG = `The live reading basis is stale for this operation. Re-open the worldline, choose a fresh pinned coordinate, or re-read through graph.query before requesting this operation. See ${READINGS_AND_OPTICS_DOC_PATH}.`;
