import { describe, expect, it } from 'vitest';

import {
  intentFromText,
  intentFromValue,
} from '../../../bin/cli/v19/V19DomainInput.ts';

describe('v19 CLI entity Intent input', () => {
  it('accepts an entity capture with its complete payload', () => {
    expect(intentFromValue({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'a fact' },
    }).descriptor).toEqual({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'a fact' },
    });
  });

  it('accepts the same entity capture as JSON text', () => {
    expect(intentFromText(JSON.stringify({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: { count: 1 },
    })).kind).toBe('entity.add');
  });

  it('rejects an entity capture with no payload', () => {
    expect(() => intentFromValue({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: {},
    })).toThrow();
  });

  it('rejects an entity capture with no subject', () => {
    expect(() => intentFromValue({
      kind: 'entity.add',
      subject: '',
      properties: { kind: 'capture' },
    })).toThrow();
  });

  it('rejects unknown fields on an entity capture', () => {
    expect(() => intentFromValue({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: { kind: 'capture' },
      extra: 'nope',
    })).toThrow();
  });
});
