import { describe, expect, it } from 'vitest';

import {
  detectSchemaVersion,
  EDGE_PROPERTY_PATCH_SCHEMA_VERSION,
} from '../../../../src/domain/services/codec/WarpMessageCodec.ts';
import { lowerCanonicalOp } from '../../../../src/domain/services/OpNormalizer.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';

const RAW_EDGE_PROPSET_SCHEMA_VERSION = 4;

describe('ADR 2 EdgePropSet wire migration gate', () => {
  it('keeps canonical EdgePropSet lowered to legacy raw PropSet storage', () => {
    const canonical = new EdgePropSet({
      from: 'alice',
      to: 'bob',
      label: 'follows',
      key: 'weight',
      value: 0.9,
    });

    const raw = lowerCanonicalOp(canonical);

    expect(raw).toBeInstanceOf(PropSet);
    if (raw instanceof PropSet) {
      expect(raw.type).toBe('PropSet');
      expect(raw.node).toBe('\x01alice\0bob\0follows');
      expect(raw.key).toBe('weight');
      expect(raw.value).toBe(0.9);
    }
  });

  it('does not claim the deferred raw EdgePropSet schema version', () => {
    const canonical = new EdgePropSet({
      from: 'source',
      to: 'target',
      label: 'rel',
      key: 'status',
      value: 'draft',
    });

    expect(detectSchemaVersion([canonical])).toBe(EDGE_PROPERTY_PATCH_SCHEMA_VERSION);
    expect(detectSchemaVersion([canonical])).not.toBe(RAW_EDGE_PROPSET_SCHEMA_VERSION);
  });
});
