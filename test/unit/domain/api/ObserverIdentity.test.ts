import { describe, expect, it } from 'vitest';
import ObserverIdentity from '../../../../src/domain/api/ObserverIdentity.ts';
import ObserverIdentityError from '../../../../src/domain/errors/ObserverIdentityError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('ObserverIdentity', () => {
  it('constructs a frozen identity with namespace and subject', () => {
    const observer = ObserverIdentity.of('tenant', 'alice');
    expect(observer.namespace).toBe('tenant');
    expect(observer.subject).toBe('alice');
    expect(Object.isFrozen(observer)).toBe(true);
  });

  it('formats to string as namespace:subject', () => {
    const observer = ObserverIdentity.of('org.example', 'service-worker');
    expect(observer.toString()).toBe('org.example:service-worker');
  });

  it('refuses an empty namespace', () => {
    expect(() => ObserverIdentity.of('', 'alice')).toThrow(ObserverIdentityError);
    expect(() => ObserverIdentity.of('', 'alice')).toThrow(WarpError);
  });

  it('refuses an empty subject', () => {
    expect(() => ObserverIdentity.of('tenant', '')).toThrow(ObserverIdentityError);
  });

  it('refuses non-string values', () => {
    // @ts-expect-error Runtime check for non-string namespace
    expect(() => ObserverIdentity.of(null, 'alice')).toThrow(ObserverIdentityError);
    // @ts-expect-error Runtime check for non-string subject
    expect(() => ObserverIdentity.of('tenant', 123)).toThrow(ObserverIdentityError);
  });

  it('refuses ill-formed strings with unpaired surrogates', () => {
    expect(() => ObserverIdentity.of('tenant', '\uD800')).toThrow(ObserverIdentityError);
    expect(() => ObserverIdentity.of('\uD800', 'alice')).toThrow(ObserverIdentityError);
  });

  it('refuses colon delimiter in namespace or subject and enforces validation in constructor', () => {
    expect(() => ObserverIdentity.of('tenant:sub', 'alice')).toThrow(ObserverIdentityError);
    expect(() => ObserverIdentity.of('tenant', 'alice:1')).toThrow(ObserverIdentityError);
    expect(() => Reflect.construct(ObserverIdentity, ['', 'alice'])).toThrow(ObserverIdentityError);
  });
});
