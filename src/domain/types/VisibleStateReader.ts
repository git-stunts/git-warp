import type { ContentMeta } from './ContentMeta.ts';
import type { VisibleEdgeViewV5 } from './VisibleEdgeViewV5.ts';
import type { VisibleNodeView } from './VisibleNodeView.ts';
import type { VisibleStateNeighbor } from './VisibleStateNeighbor.ts';
import type { VisibleStateProjectionV5 } from './VisibleStateProjectionV5.ts';

/**
 * Read-only accessor over materialized V5 state with entity-local inspection.
 *
 * Port interface — consumers depend on this contract without coupling
 * to the concrete StateReader implementation.
 */
export interface VisibleStateReader {
  project(): VisibleStateProjectionV5;
  hasNode(nodeId: string): boolean;
  getNodes(): string[];
  getEdges(): VisibleEdgeViewV5[];
  getNodeProps(nodeId: string): Record<string, unknown> | null;
  getEdgeProps(from: string, to: string, label: string): Record<string, unknown> | null;
  neighbors(
    nodeId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    edgeLabel?: string,
  ): VisibleStateNeighbor[];
  getNodeContentMeta(nodeId: string): ContentMeta | null;
  getEdgeContentMeta(from: string, to: string, label: string): ContentMeta | null;
  inspectNode(nodeId: string): VisibleNodeView | null;
}
