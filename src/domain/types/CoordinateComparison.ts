/**
 * Type family for coordinate comparison and transfer plan results.
 *
 * Extracted from _wiredMethods.d.ts to give these types a proper
 * importable home. Will become runtime-backed classes during god kills.
 */

import type { ContentMeta } from './ContentMeta.ts';

export type VisibleStateSummaryV5 = {
  nodeCount: number;
  edgeCount: number;
  nodePropertyCount: number;
  edgePropertyCount: number;
};

export type VisibleStateScopePrefixFilterV1 = {
  include?: string[];
  exclude?: string[];
};

export type VisibleStateScopeV1 = {
  nodeIdPrefixes?: VisibleStateScopePrefixFilterV1;
};

export type CoordinateComparisonSelectorV1 =
  | { kind: 'live'; ceiling?: number | null }
  | { kind: 'strand'; strandId: string; ceiling?: number | null }
  | { kind: 'strand_base'; strandId: string; ceiling?: number | null }
  | { kind: 'coordinate'; frontier: Map<string, string> | Record<string, string>; ceiling?: number | null };

export type CoordinateTransferPlanSelectorV1 = CoordinateComparisonSelectorV1;

export type CoordinateComparisonSideV1 = {
  requested: Record<string, unknown>;
  resolved: {
    coordinateKind: 'frontier' | 'strand' | 'strand_base';
    patchFrontier: Record<string, string>;
    patchFrontierDigest: string;
    lamportFrontier: Record<string, number>;
    lamportFrontierDigest: string;
    lamportCeiling: number | null;
    stateHash: string;
    patchUniverseDigest: string;
    summary: VisibleStateSummaryV5 & { patchCount: number };
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
};

export type VisibleStateComparisonV5 = {
  comparisonVersion: string;
  changed: boolean;
  summary: {
    left: VisibleStateSummaryV5;
    right: VisibleStateSummaryV5;
    nodes: { added: number; removed: number };
    edges: { added: number; removed: number };
    nodeProperties: { added: number; removed: number; changed: number };
    edgeProperties: { added: number; removed: number; changed: number };
  };
  nodes: {
    added: string[];
    removed: string[];
  };
  edges: {
    added: Array<{ from: string; to: string; label: string }>;
    removed: Array<{ from: string; to: string; label: string }>;
  };
  nodeProperties: {
    added: Array<{ node: string; key: string; value: unknown }>;
    removed: Array<{ node: string; key: string; value: unknown }>;
    changed: Array<{ node: string; key: string; leftValue: unknown; rightValue: unknown }>;
  };
  edgeProperties: {
    added: Array<{ from: string; to: string; label: string; key: string; value: unknown }>;
    removed: Array<{ from: string; to: string; label: string; key: string; value: unknown }>;
    changed: Array<{ from: string; to: string; label: string; key: string; leftValue: unknown; rightValue: unknown }>;
  };
  target?: {
    targetId: string | null;
    leftExists: boolean;
    rightExists: boolean;
    changed: boolean;
    left: {
      nodeId: string;
      props: Record<string, unknown>;
      outgoing: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      incoming: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      content: ContentMeta | null;
    } | null;
    right: {
      nodeId: string;
      props: Record<string, unknown>;
      outgoing: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      incoming: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      content: ContentMeta | null;
    } | null;
    propertyDelta: {
      added: Array<{ key: string; value: unknown }>;
      removed: Array<{ key: string; value: unknown }>;
      changed: Array<{ key: string; leftValue: unknown; rightValue: unknown }>;
    };
    outgoingDelta: {
      added: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      removed: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
    };
    incomingDelta: {
      added: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      removed: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
    };
    contentChanged: boolean;
  };
};

export type CoordinateComparisonV1 = {
  comparisonVersion: string;
  comparisonDigest: string;
  scope?: VisibleStateScopeV1;
  left: CoordinateComparisonSideV1;
  right: CoordinateComparisonSideV1;
  visiblePatchDivergence: {
    sharedCount: number;
    leftOnlyCount: number;
    rightOnlyCount: number;
    leftOnlyPatchShas: string[];
    rightOnlyPatchShas: string[];
    target?: {
      targetId: string;
      leftCount: number;
      rightCount: number;
      sharedCount: number;
      leftOnlyCount: number;
      rightOnlyCount: number;
      leftOnlyPatchShas: string[];
      rightOnlyPatchShas: string[];
    };
  };
  visibleState: VisibleStateComparisonV5;
};

export type VisibleStateTransferPlanSummaryV1 = {
  opCount: number;
  addNodeCount: number;
  removeNodeCount: number;
  setNodePropertyCount: number;
  clearNodePropertyCount: number;
  addEdgeCount: number;
  removeEdgeCount: number;
  setEdgePropertyCount: number;
  clearEdgePropertyCount: number;
  attachNodeContentCount: number;
  clearNodeContentCount: number;
  attachEdgeContentCount: number;
  clearEdgeContentCount: number;
};

export type VisibleStateTransferOperationV1 =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | { op: 'attach_node_content'; nodeId: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_node_content'; nodeId: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

export type CoordinateTransferPlanSideV1 = CoordinateComparisonSideV1;

export type CoordinateTransferPlanV1 = {
  transferVersion: string;
  transferDigest: string;
  comparisonDigest: string;
  scope?: VisibleStateScopeV1;
  changed: boolean;
  source: CoordinateTransferPlanSideV1;
  target: CoordinateTransferPlanSideV1;
  summary: VisibleStateTransferPlanSummaryV1;
  ops: VisibleStateTransferOperationV1[];
};
