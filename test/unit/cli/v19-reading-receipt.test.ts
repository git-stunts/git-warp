import { describe, expect, it } from 'vitest';

import {
  isMcpJsonObject,
  type McpJsonObject,
  type McpJsonValue,
} from '../../../bin/cli/commands/mcp/McpJsonValue.ts';
import {
  readingEnvelope,
} from '../../../bin/presenters/V19ReadingReceipt.ts';
import { toMcpJson } from '../../../bin/presenters/V19Json.ts';
import Reading from '../../../src/domain/api/ObservedReading.ts';
import ConcurrentValue from '../../../src/domain/api/ConcurrentValue.ts';
import LifecyclePlurality from '../../../src/domain/api/LifecyclePlurality.ts';
import RegisterPlurality from '../../../src/domain/api/RegisterPlurality.ts';

describe('v19 Reading presentation', () => {
  it('preserves __proto__ as ordinary own JSON data', () => {
    const reading = new Reading({
      evidence: {
        basis: { id: 'basis:proto' },
        support: [],
      },
      lane: 'captures',
      value: { ['__proto__']: { polluted: true } },
    });

    const envelope = requireMcpJsonObject(readingEnvelope(reading));
    const value = requireMcpJsonObject(envelope['value']);

    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(value['__proto__']).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);

    const direct = requireMcpJsonObject(toMcpJson({ ['__proto__']: 'direct' }));
    expect(Object.hasOwn(direct, '__proto__')).toBe(true);
    expect(direct['__proto__']).toBe('direct');
  });
});

describe('v19 plurality presentation (#1039)', () => {
  it('renders register races and deletes raced by edits as canonical JSON on a Reading', () => {
    const reading = new Reading({
      evidence: { basis: { id: 'basis:plural' }, support: [] },
      lane: 'margins',
      value: 'bob edit',
      plurality: [
        new RegisterPlurality({
          subject: 'comment:1', key: 'body', winner: new ConcurrentValue({ writer: 'bob', value: 'bob edit' }),
          siblings: [new ConcurrentValue({ writer: 'alice', value: { nested: [1] } })], overflow: 0, causality: 'observed',
        }),
        new LifecyclePlurality({
          element: { kind: 'node', subject: 'comment:1' }, removedBy: ['carol'], editedBy: ['alice'], overflow: 2, causality: 'underdetermined',
        }),
      ],
    });
    expect(requireMcpJsonObject(readingEnvelope(reading))['plurality']).toEqual([
      {
        kind: 'register', subject: 'comment:1', key: 'body', winner: { writer: 'bob', value: 'bob edit' },
        siblings: [{ writer: 'alice', value: { nested: [1] } }], overflow: 0, causality: 'observed',
      },
      {
        kind: 'lifecycle', element: { kind: 'node', subject: 'comment:1' }, removedBy: ['carol'], editedBy: ['alice'],
        overflow: 2, causality: 'underdetermined',
      },
    ]);
    const plain = new Reading({ evidence: { basis: { id: 'basis:one' }, support: [] }, lane: 'margins', value: 1 });
    expect(Object.hasOwn(requireMcpJsonObject(readingEnvelope(plain)), 'plurality')).toBe(false);
  });
});

function requireMcpJsonObject(
  value: McpJsonValue | undefined,
): McpJsonObject {
  if (!isMcpJsonObject(value)) {
    throw new TypeError('expected MCP JSON object');
  }
  return value;
}
