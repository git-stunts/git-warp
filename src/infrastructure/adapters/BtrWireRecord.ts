import type { BtrWireProvenanceEntry } from './BtrWireProvenanceEntry.ts';

type BtrWireSigningEnvelope = {
  readonly version: number;
  readonly h_in: string;
  readonly h_out: string;
  readonly U_0: Uint8Array;
  readonly P: readonly BtrWireProvenanceEntry[];
  readonly t: string;
};

type BtrWireRecord = BtrWireSigningEnvelope & {
  readonly kappa: string;
};

export type { BtrWireRecord, BtrWireSigningEnvelope };
