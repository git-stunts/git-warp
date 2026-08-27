import { describe, expect, it } from 'vitest';

import { isMcpJsonObject } from '../../../bin/cli/commands/mcp/McpJsonValue.ts';
import {
  readingEnvelope,
} from '../../../bin/presenters/V19ReadingReceipt.ts';
import { toMcpJson } from '../../../bin/presenters/V19Json.ts';
import Reading from '../../../src/domain/api/ObservedReading.ts';

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

    const envelope = readingEnvelope(reading);
    expect(isMcpJsonObject(envelope)).toBe(true);
    if (!isMcpJsonObject(envelope)) {
      return;
    }
    const value = envelope['value'];
    expect(isMcpJsonObject(value)).toBe(true);
    if (!isMcpJsonObject(value)) {
      return;
    }

    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(value['__proto__']).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);

    const direct = toMcpJson({ ['__proto__']: 'direct' });
    expect(isMcpJsonObject(direct)).toBe(true);
    if (isMcpJsonObject(direct)) {
      expect(Object.hasOwn(direct, '__proto__')).toBe(true);
      expect(direct['__proto__']).toBe('direct');
    }
  });
});
