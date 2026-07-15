import type { PublishedPatch } from '../../ports/PatchJournalPort.ts';
import type Patch from './Patch.ts';

/** Evidence-bearing result of one causally published patch. */
export type PatchCommitResult = PublishedPatch & Readonly<{ patch: Patch }>;
