import type { EffectEmission } from '../../domain/types/EffectEmission.ts';
import { sortedReplacer } from '../../domain/utils/canonicalStringify.ts';

export function canonicalEmissionJson(emission: EffectEmission): string {
  return JSON.stringify(emission, sortedReplacer);
}
