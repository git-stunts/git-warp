import { describe, expect, it } from 'vitest';
import Purpose from '../../../../src/domain/api/Purpose.ts';
import PurposeError from '../../../../src/domain/errors/PurposeError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('Purpose', () => {
  it('constructs a frozen purpose with namespace, name and version', () => {
    const purpose = Purpose.of('audit', 'compliance', 1);
    expect(purpose.namespace).toBe('audit');
    expect(purpose.name).toBe('compliance');
    expect(purpose.version).toBe(1);
    expect(Object.isFrozen(purpose)).toBe(true);
  });

  it('formats to string as namespace:name/vVERSION', () => {
    const purpose = Purpose.of('lens', 'snapshot-verify', 2);
    expect(purpose.toString()).toBe('lens:snapshot-verify/v2');
  });

  it('refuses an empty namespace or name', () => {
    expect(() => Purpose.of('', 'query', 1)).toThrow(PurposeError);
    expect(() => Purpose.of('', 'query', 1)).toThrow(WarpError);
    expect(() => Purpose.of('lens', '', 1)).toThrow(PurposeError);
  });

  it('refuses non-string namespace or name', () => {
    expect(() => Purpose.of(null as unknown as string, 'query', 1)).toThrow(PurposeError);
    expect(() => Purpose.of('lens', 123 as unknown as string, 1)).toThrow(PurposeError);
  });

  it('refuses ill-formed strings', () => {
    expect(() => Purpose.of('lens', '\uD800', 1)).toThrow(PurposeError);
    expect(() => Purpose.of('\uD800', 'query', 1)).toThrow(PurposeError);
  });

  it('refuses non-positive versions', () => {
    expect(() => Purpose.of('lens', 'query', 0)).toThrow(PurposeError);
    expect(() => Purpose.of('lens', 'query', -1)).toThrow(PurposeError);
  });

  it('refuses fractional, non-integer or unsafe versions', () => {
    expect(() => Purpose.of('lens', 'query', 1.5)).toThrow(PurposeError);
    expect(() => Purpose.of('lens', 'query', NaN)).toThrow(PurposeError);
    expect(() => Purpose.of('lens', 'query', Infinity)).toThrow(PurposeError);
    expect(() => Purpose.of('lens', 'query', Number.MAX_SAFE_INTEGER + 1)).toThrow(PurposeError);
  });
});
