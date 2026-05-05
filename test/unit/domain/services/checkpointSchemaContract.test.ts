import { describe, expect, it } from 'vitest';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  REJECTED_LEGACY_CHECKPOINT_SCHEMAS,
  SUPPORTED_CHECKPOINT_SCHEMAS,
  isRejectedLegacyCheckpointSchema,
  isV5CheckpointSchema,
} from '../../../../src/domain/services/state/checkpointHelpers.ts';

describe('checkpoint schema support contract', () => {
  it('names schema 5 as the only supported shipped runtime schema', () => {
    expect(CURRENT_CHECKPOINT_SCHEMA).toBe(5);
    expect(SUPPORTED_CHECKPOINT_SCHEMAS).toEqual([5]);
    expect(isV5CheckpointSchema(5)).toBe(true);
  });

  it('names schemas 2 3 and 4 as rejected legacy checkpoint schemas', () => {
    expect(REJECTED_LEGACY_CHECKPOINT_SCHEMAS).toEqual([2, 3, 4]);

    for (const schema of REJECTED_LEGACY_CHECKPOINT_SCHEMAS) {
      expect(isRejectedLegacyCheckpointSchema(schema)).toBe(true);
      expect(isV5CheckpointSchema(schema)).toBe(false);
    }
  });
});
