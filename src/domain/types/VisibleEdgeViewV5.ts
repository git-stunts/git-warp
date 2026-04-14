/**
 * Edge-local view from visible state: endpoints, label, and properties.
 */
export type VisibleEdgeViewV5 = {
  from: string;
  to: string;
  label: string;
  props: Record<string, unknown>;
};
