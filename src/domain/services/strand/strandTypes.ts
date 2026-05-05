/**
 * Canonical strand model types shared by the strand collaborators.
 *
 * This centralizes the strand shape corridor so the extracted services
 * stop re-declaring the same descriptor, queue, and tick record forms.
 *
 * @module domain/services/strand/strandTypes
 */

import type { StrandDescriptor as ParsedStrandBlob } from '../../utils/parseStrandBlob.ts';
import type { StrandReadOverlayDescriptor, StrandIntentQueue, StrandEvolution } from './descriptorNormalization.ts';
import type Patch from '../../types/Patch.ts';

export type { StrandReadOverlayDescriptor, StrandIntentQueue, StrandEvolution };

export type StrandQueuedIntent = {
  intentId: string;
  enqueuedAt: string;
  patch: Patch;
  reads: string[];
  writes: string[];
  contentBlobOids: string[];
};

export type StrandRejectedCounterfactual = {
  intentId: string;
  reason: string;
  conflictsWith: string[];
  reads: string[];
  writes: string[];
};

export type StrandTickRecord = {
  tickId: string;
  strandId: string;
  tickIndex: number;
  createdAt: string;
  drainedIntentCount: number;
  admittedIntentIds: string[];
  rejected: StrandRejectedCounterfactual[];
  baseOverlayHeadPatchSha: string | null;
  overlayHeadPatchSha: string | null;
  overlayPatchShas: string[];
};

/** Full runtime strand descriptor (overlay + braid + intentQueue + evolution). */
export type StrandDescriptor = ParsedStrandBlob & {
  overlay: ParsedStrandBlob['overlay'] & { writable: boolean };
  braid: { readOverlays: StrandReadOverlayDescriptor[] };
  intentQueue: StrandIntentQueue;
  evolution: StrandEvolution;
};
