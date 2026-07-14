/**
 * Module-level helpers used by RuntimeHost.open() and the constructor.
 *
 * Extracted from the monolithic runtime host as part of the
 * TypeScript migration.
 *
 * @module domain/runtimeHelpers
 */

import type EffectSinkPort from '../ports/EffectSinkPort.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type { MultiplexSink } from './services/MultiplexSink.ts';
import WarpError from './errors/WarpError.ts';

/**
 * Constructs an EffectPipeline from an array of sinks and an optional externalization lens.
 */
export async function buildEffectPipeline(
  sinks: readonly EffectSinkPort[],
  lens: ExternalizationPolicy | undefined,
): Promise<EffectPipeline> {
  const multMod: { MultiplexSink: typeof MultiplexSink } = await import('./services/MultiplexSink.ts');
  const effMod: { EffectPipeline: typeof EffectPipeline } = await import('./services/EffectPipeline.ts');
  const mux = new multMod.MultiplexSink();
  for (const sink of sinks) {
    mux.addSink(sink);
  }
  let resolvedLens: ExternalizationPolicy;
  if (lens !== null && lens !== undefined) {
    resolvedLens = lens;
  } else {
    const mod = await import('./types/ExternalizationPolicy.ts');
    resolvedLens = mod.LIVE_LENS;
  }
  return new effMod.EffectPipeline({ sink: mux, lens: resolvedLens });
}

const VALID_TRUST_MODES = ['off', 'log-only', 'enforce'] as const;

export type TrustMode = 'off' | 'log-only' | 'enforce';

export type NormalizedTrustConfig = {
  mode: TrustMode;
  pin: string | null;
};

/**
 * Validates and returns the trust mode from a raw config.
 */
export function validateTrustMode(mode: string): TrustMode {
  if (!VALID_TRUST_MODES.includes(mode as TrustMode)) {
    throw new WarpError('trust.mode must be one of: off, log-only, enforce', 'E_TRUST_CONFIG');
  }
  return mode as TrustMode;
}

/**
 * Validates and returns the trust pin from a raw config.
 */
export function validateTrustPin(pin: string | null | undefined): string | null {
  if (pin !== undefined && pin !== null && typeof pin !== 'string') {
    throw new WarpError('trust.pin must be a string', 'E_TRUST_CONFIG');
  }
  return pin ?? null;
}

/**
 * Normalizes a trust configuration into a canonical shape with defaults.
 */
export function normalizeTrustConfig(
  trust: { mode?: TrustMode; pin?: string | null } | undefined | null,
): NormalizedTrustConfig {
  if (trust === null || trust === undefined) {
    return { mode: 'off', pin: null };
  }
  if (typeof trust !== 'object') {
    throw new WarpError('trust must be an object', 'E_TRUST_CONFIG');
  }
  return {
    mode: validateTrustMode(trust.mode ?? 'off'),
    pin: validateTrustPin(trust.pin),
  };
}
