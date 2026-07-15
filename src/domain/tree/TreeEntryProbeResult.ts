import type TreeEntryFound from './TreeEntryFound.ts';
import type TreeEntryMissing from './TreeEntryMissing.ts';

/** Result of probing one exact tree entry through the history boundary. */
export type TreeEntryProbeResult = TreeEntryFound | TreeEntryMissing;
