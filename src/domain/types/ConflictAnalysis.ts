/**
 * Type family for conflict analysis results.
 *
 * Extracted from _wiredMethods.d.ts to give these types a proper
 * importable home. Will become runtime-backed classes during god kills.
 */

export type ConflictKind = 'supersession' | 'eventual_override' | 'redundancy';
export type ConflictEvidenceLevel = 'summary' | 'standard' | 'full';
export type ConflictCausalRelation = 'concurrent' | 'ordered' | 'replay_equivalent' | 'reducer_collapsed';

export type ConflictTargetSelector = {
  targetKind: 'node' | 'edge' | 'node_property' | 'edge_property';
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
};

export type ConflictAnchor = {
  patchSha: string;
  writerId: string;
  lamport: number;
  opIndex: number;
  receiptPatchSha?: string;
  receiptLamport?: number;
  receiptOpIndex?: number;
};

export type ConflictTarget = {
  targetKind: 'node' | 'edge' | 'node_property' | 'edge_property';
  targetDigest: string;
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
  edgeKey?: string;
};

export type ConflictParticipant = {
  anchor: ConflictAnchor;
  effectDigest: string;
  causalRelationToWinner?: ConflictCausalRelation;
  structurallyDistinctAlternative: boolean;
  replayableFromAnchors: boolean;
  notes?: string[];
};

export type ConflictResolution = {
  reducerId: string;
  basis: { code: string; reason?: string };
  winnerMode: 'immediate' | 'eventual';
  comparator?: {
    type: 'event_id' | 'effect_digest';
    winnerEventId?: { lamport: number; writerId: string; patchSha: string; opIndex: number };
    loserEventId?: { lamport: number; writerId: string; patchSha: string; opIndex: number };
  };
};

export type ConflictTrace = {
  conflictId: string;
  kind: ConflictKind;
  target: ConflictTarget;
  winner: {
    anchor: ConflictAnchor;
    effectDigest: string;
  };
  losers: ConflictParticipant[];
  resolution: ConflictResolution;
  whyFingerprint: string;
  classificationNotes?: string[];
  evidence: {
    level: ConflictEvidenceLevel;
    patchRefs: string[];
    receiptRefs: Array<{ patchSha: string; lamport: number; opIndex: number }>;
  };
};

export type ConflictDiagnostic = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  data?: Record<string, unknown>;
};

export type ConflictAnalysis = {
  analysisVersion: string;
  resolvedCoordinate: {
    analysisVersion: string;
    coordinateKind: 'frontier' | 'strand';
    frontier: Record<string, string>;
    frontierDigest: string;
    lamportCeiling: number | null;
    scanBudgetApplied: { maxPatches: number | null };
    truncationPolicy: string;
    strand?: {
      strandId: string;
      baseLamportCeiling: number | null;
      overlayHeadPatchSha: string | null;
      overlayPatchCount: number;
      overlayWritable: boolean;
      braid: {
        readOverlayCount: number;
        braidedStrandIds: string[];
      };
    };
  };
  analysisSnapshotHash: string;
  diagnostics?: ConflictDiagnostic[];
  conflicts: ConflictTrace[];
};

export type AnalyzeConflictsOptions = {
  at?: { lamportCeiling?: number | null };
  strandId?: string;
  entityId?: string;
  target?: ConflictTargetSelector;
  kind?: ConflictKind | ConflictKind[];
  writerId?: string;
  evidence?: ConflictEvidenceLevel;
  scanBudget?: { maxPatches?: number };
};
