import type { ContentMeta } from './ContentMeta.ts';
import type { VisibleEdgeView } from './VisibleEdgeView.ts';
import type { VisibleNodeView } from './VisibleNodeView.ts';
import type { VisibleStateNeighbor } from './VisibleStateNeighbor.ts';
import type { VisibleStateProjection } from './VisibleStateProjection.ts';
import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';

type VisibleStateProperties = Readonly<{ [key: string]: SnapshotPropValue }>;

/**
 * Read-only accessor over materialized V5 state with entity-local inspection.
 *
 * Port interface — consumers depend on this contract without coupling
 * to the concrete StateReader implementation.
 */
export interface VisibleStateReader {
  project(): VisibleStateProjection;
  hasNode(nodeId: string): boolean;
  getNodes(): string[];
  getEdges(): VisibleEdgeView[];
  getNodeProps(nodeId: string): VisibleStateProperties | null;
  getEdgeProps(from: string, to: string, label: string): VisibleStateProperties | null;
  neighbors(
    nodeId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    edgeLabel?: string,
  ): VisibleStateNeighbor[];
  getNodeContentMeta(nodeId: string): ContentMeta | null;
  getEdgeContentMeta(from: string, to: string, label: string): ContentMeta | null;
  inspectNode(nodeId: string): VisibleNodeView | null;
}
