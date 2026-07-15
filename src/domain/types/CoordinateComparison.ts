/**
 * Type family for coordinate comparison and transfer plan results.
 *
 * Extracted from _wiredMethods.d.ts to give these types a proper
 * importable home. Will become runtime-backed classes during god kills.
 */

import type { ContentMeta } from './ContentMeta.ts';

export type VisibleStateSummary = {
  nodeCount: number;
  edgeCount: number;
  nodePropertyCount: number;
  edgePropertyCount: number;
};

export type VisibleStateScopePrefixFilter = {
  include?: string[];
  exclude?: string[];
};

export type VisibleStateScope = {
  nodeIdPrefixes?: VisibleStateScopePrefixFilter;
};

export type CoordinateComparisonSelectorInput =
  | { kind: 'live'; ceiling?: number | null }
  | { kind: 'strand'; strandId: string; ceiling?: number | null }
  | { kind: 'strand_base'; strandId: string; ceiling?: number | null }
  | { kind: 'coordinate'; frontier: Map<string, string> | Record<string, string>; ceiling?: number | null };

export type CoordinateTransferPlanSelectorInput = CoordinateComparisonSelectorInput;

export type CoordinateComparisonSide = {
  requested: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  resolved: {
    coordinateKind: 'frontier' | 'strand' | 'strand_base';
    patchFrontier: Record<string, string>;
    patchFrontierDigest: string;
    lamportFrontier: Record<string, number>;
    lamportFrontierDigest: string;
    lamportCeiling: number | null;
    stateHash: string;
    patchUniverseDigest: string;
    summary: VisibleStateSummary & { patchCount: number };
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

export type VisibleStateComparison = {
  comparisonVersion: string;
  changed: boolean;
  summary: {
    left: VisibleStateSummary;
    right: VisibleStateSummary;
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
    added: Array<{ node: string; key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    removed: Array<{ node: string; key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    changed: Array<{ node: string; key: string; leftValue: unknown; rightValue: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  };
  edgeProperties: {
    added: Array<{ from: string; to: string; label: string; key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    removed: Array<{ from: string; to: string; label: string; key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    changed: Array<{ from: string; to: string; label: string; key: string; leftValue: unknown; rightValue: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  };
  target?: {
    targetId: string | null;
    leftExists: boolean;
    rightExists: boolean;
    changed: boolean;
    left: {
      nodeId: string;
      props: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
      outgoing: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      incoming: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      content: ContentMeta | null;
    } | null;
    right: {
      nodeId: string;
      props: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
      outgoing: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      incoming: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;
      content: ContentMeta | null;
    } | null;
    propertyDelta: {
      added: Array<{ key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
      removed: Array<{ key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
      changed: Array<{ key: string; leftValue: unknown; rightValue: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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

export type CoordinateComparison = {
  comparisonVersion: string;
  comparisonDigest: string;
  scope?: VisibleStateScope;
  left: CoordinateComparisonSide;
  right: CoordinateComparisonSide;
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
  visibleState: VisibleStateComparison;
};

export type VisibleStateTransferPlanSummary = {
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

export type VisibleStateTransferOperation =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown } // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown } // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  | { op: 'attach_node_content'; nodeId: string; content: Uint8Array; contentHandle: string; mime?: string | null; size?: number | null }
  | { op: 'clear_node_content'; nodeId: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; content: Uint8Array; contentHandle: string; mime?: string | null; size?: number | null }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

export type CoordinateTransferPlanSide = CoordinateComparisonSide;

export type CoordinateTransferPlan = {
  transferVersion: string;
  transferDigest: string;
  comparisonDigest: string;
  scope?: VisibleStateScope;
  changed: boolean;
  source: CoordinateTransferPlanSide;
  target: CoordinateTransferPlanSide;
  summary: VisibleStateTransferPlanSummary;
  ops: VisibleStateTransferOperation[];
};
