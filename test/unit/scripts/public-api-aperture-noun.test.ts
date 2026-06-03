import { describe, expect, it } from 'vitest';
import {
  Observer,
  computeTranslationCost,
} from '../../../index.ts';
import type {
  Aperture,
  ObserverConfig,
} from '../../../index.ts';

function acceptAperture(config: Aperture): ObserverConfig {
  return config;
}

describe('Aperture is a first-class public noun', () => {
  it('exports runtime observer surfaces used by Aperture consumers', () => {
    expect(Observer).toBeDefined();
    expect(typeof computeTranslationCost).toBe('function');
  });

  it('exports Aperture and keeps ObserverConfig assignable as a compatibility alias', () => {
    const aperture = {
      match: 'user:*',
      expose: ['name'],
      redact: ['secret'],
    } satisfies Aperture;

    const observerConfig: ObserverConfig = acceptAperture(aperture);

    expect(observerConfig.match).toBe('user:*');
    expect(observerConfig.expose).toEqual(['name']);
    expect(observerConfig.redact).toEqual(['secret']);
  });
});
