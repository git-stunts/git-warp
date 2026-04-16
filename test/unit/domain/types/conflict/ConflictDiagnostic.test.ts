import { describe, it, expect } from 'vitest';
import ConflictDiagnostic, { type ConflictDiagnosticData } from '../../../../../src/domain/types/conflict/ConflictDiagnostic.ts';

describe('ConflictDiagnostic', () => {
  it('creates a frozen diagnostic', () => {
    const d = new ConflictDiagnostic({ code: 'truncated', severity: 'warning', message: 'scan truncated' });
    expect(d.code).toBe('truncated');
    expect(d.severity).toBe('warning');
    expect(d.message).toBe('scan truncated');
    expect(d.data).toBeUndefined();
    expect(Object.isFrozen(d)).toBe(true);
  });

  it('freezes optional data object', () => {
    const d = new ConflictDiagnostic({ code: 'err', severity: 'error', message: 'bad', data: { key: 'val' } });
    expect(d.data).toEqual({ key: 'val' });
    expect(Object.isFrozen(d.data)).toBe(true);
  });

  it('treats null data as undefined', () => {
    const d = new ConflictDiagnostic({ code: 'x', severity: 'warning', message: 'y', data: null as unknown as ConflictDiagnosticData });
    expect(d.data).toBeUndefined();
  });

  it('rejects empty code', () => {
    expect(() => new ConflictDiagnostic({ code: '', severity: 'warning', message: 'x' })).toThrow('code');
  });

  it('rejects invalid severity', () => {
    expect(() => new ConflictDiagnostic({ code: 'x', severity: 'info' as 'error' | 'warning', message: 'x' })).toThrow('severity');
  });

  it('rejects empty message', () => {
    expect(() => new ConflictDiagnostic({ code: 'x', severity: 'warning', message: '' })).toThrow('message');
  });

  it('round-trips through JSON', () => {
    const d = new ConflictDiagnostic({ code: 'a', severity: 'error', message: 'b', data: { n: 1 } });
    const json = JSON.parse(JSON.stringify(d));
    expect(json.code).toBe('a');
    expect(json.data).toEqual({ n: 1 });
  });
});
