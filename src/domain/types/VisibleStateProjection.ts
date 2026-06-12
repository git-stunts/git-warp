/**
 * Compact projection of visible state: lists of node IDs, edges, and properties.
 */
export type VisibleStateProjection = {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
};
