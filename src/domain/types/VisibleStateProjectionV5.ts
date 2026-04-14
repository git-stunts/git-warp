/**
 * Compact projection of visible state: lists of node IDs, edges, and properties.
 */
export type VisibleStateProjectionV5 = {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: unknown }>;
};
