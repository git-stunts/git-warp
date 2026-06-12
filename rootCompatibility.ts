import createBoundedMemoryCapabilityReport
  from './src/domain/memory/createBoundedMemoryCapabilityReport.ts';
import type { PropValue } from './src/domain/types/PropValue.ts';

export function createNodeAdd(node: string): { type: 'NodeAdd'; node: string } {
  return { type: 'NodeAdd' as const, node };
}

export function createNodeTombstone(node: string): { type: 'NodeTombstone'; node: string } {
  return { type: 'NodeTombstone' as const, node };
}

export function createEdgeAdd(
  from: string,
  to: string,
  label: string,
): { type: 'EdgeAdd'; from: string; to: string; label: string } {
  return { type: 'EdgeAdd' as const, from, to, label };
}

export function createEdgeTombstone(
  from: string,
  to: string,
  label: string,
): { type: 'EdgeTombstone'; from: string; to: string; label: string } {
  return { type: 'EdgeTombstone' as const, from, to, label };
}

type PropSetValue = { type: 'inline'; value: PropValue } | { type: 'blob'; oid: string };

export function createPropSet(
  node: string,
  key: string,
  value: PropSetValue,
): { type: 'PropSet'; node: string; key: string; value: PropSetValue } {
  return { type: 'PropSet' as const, node, key, value };
}

export function createInlineValue(value: PropValue): { type: 'inline'; value: PropValue } {
  return { type: 'inline' as const, value };
}

export function createBlobValue(oid: string): { type: 'blob'; oid: string } {
  return { type: 'blob' as const, oid };
}

/**
 * @deprecated Use createBoundedMemoryCapabilityReport.
 */
export const createV18BoundedMemoryCapabilityReport = createBoundedMemoryCapabilityReport;
