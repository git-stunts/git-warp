import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  intentFromText,
  intentFromValue,
} from '../../../bin/cli/v19/V19DomainInput.ts';

describe('v19 CLI entity Intent input', () => {
  it('documents the JSON and TypeScript occurrence surfaces separately', () => {
    const guide = readFileSync(new URL('../../../docs/topics/cli.md', import.meta.url), 'utf8');

    expect(guide).toContain('The CLI JSON envelope exposes only');
    expect(guide).toContain('The in-process TypeScript `EntityOccurrence`');
  });

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

  it('accepts substrate allocation in an application namespace', () => {
    expect(intentFromValue({
      kind: 'entity.add',
      namespace: 'entry',
      properties: { kind: 'capture', capturedAt: '2026-08-03T20:00:00.000Z' },
    }).descriptor).toEqual({
      kind: 'entity.add',
      namespace: 'entry',
      properties: { capturedAt: '2026-08-03T20:00:00.000Z', kind: 'capture' },
    });
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

  it('rejects an entity capture with both supplied and allocated identity', () => {
    expect(() => intentFromValue({
      kind: 'entity.add',
      subject: 'entry:1',
      namespace: 'entry',
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
