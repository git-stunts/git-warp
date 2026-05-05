import { describe, expect, it } from 'vitest';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  SUPPORTED_CHECKPOINT_SCHEMAS,
  isCurrentCheckpointSchema,
} from '../../../../src/domain/services/state/checkpointHelpers.ts';

describe('checkpoint schema support contract', () => {
  it('names the current schema as the only supported shipped runtime schema', () => {
    expect(CURRENT_CHECKPOINT_SCHEMA).toBe(5);
    expect(SUPPORTED_CHECKPOINT_SCHEMAS).toEqual([5]);
    expect(isCurrentCheckpointSchema(5)).toBe(true);
  });

  it('does not expose retired-schema policy from shipped runtime helpers', () => {
    expect(isCurrentCheckpointSchema(2)).toBe(false);
    expect(isCurrentCheckpointSchema(3)).toBe(false);
    expect(isCurrentCheckpointSchema(4)).toBe(false);
  });
});
