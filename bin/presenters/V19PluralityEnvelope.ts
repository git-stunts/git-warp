import LifecyclePlurality from '../../src/domain/api/LifecyclePlurality.ts';
import type { Plurality } from '../../src/domain/api/Plurality.ts';
import type ConcurrentValue from '../../src/domain/api/ConcurrentValue.ts';
import type { ReadingValue } from '../../src/domain/api/ReadingValue.ts';
import type { McpJsonValue } from '../cli/commands/mcp/McpJsonValue.ts';
import { toMcpJson } from './V19Json.ts';

/**
 * Canonical JSON of the plurality a Reading or write Receipt reports
 * (#1039): register races with their winner and sibling values and writers,
 * and deletes raced by edits with the writers on each side.
 */
export function pluralityEnvelope(
  plurality: readonly Plurality[],
  valueToJson: (value: ReadingValue) => McpJsonValue,
): McpJsonValue {
  return Object.freeze(plurality.map((entry) => {
    if (entry instanceof LifecyclePlurality) {
      return toMcpJson({
        kind: entry.kind, element: { ...entry.element }, removedBy: [...entry.removedBy], editedBy: [...entry.editedBy],
        overflow: entry.overflow, causality: entry.causality,
      });
    }
    const value = (concurrent: ConcurrentValue): McpJsonValue =>
      Object.freeze({ writer: concurrent.writer, value: valueToJson(concurrent.value) });
    return Object.freeze({
      kind: entry.kind, subject: entry.subject, key: entry.key, winner: value(entry.winner),
      siblings: Object.freeze(entry.siblings.map(value)), overflow: entry.overflow, causality: entry.causality,
    });
  }));
}
