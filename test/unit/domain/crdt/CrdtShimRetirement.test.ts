import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_VERSION_VECTOR_SHIMS = Object.freeze([
  'createVersionVector',
  'vvIncrement',
  'vvMerge',
  'vvDescends',
  'vvContains',
  'vvSerialize',
  'vvDeserialize',
  'vvClone',
  'vvEqual',
]);

const FORBIDDEN_ORSET_SHIMS = Object.freeze([
  'createORSet',
  'orsetAdd',
  'orsetRemove',
  'orsetContains',
  'orsetElements',
  'orsetGetDots',
  'orsetJoin',
  'orsetCompact',
  'orsetSerialize',
  'orsetDeserialize',
]);

describe('CRDT compatibility shim retirement', () => {
  it('keeps VersionVector shim exports out of the domain module', async () => {
    const source = await readFile('src/domain/crdt/VersionVector.ts', 'utf8');

    for (const shim of FORBIDDEN_VERSION_VECTOR_SHIMS) {
      expect(source).not.toContain(`export function ${shim}`);
      expect(source).not.toContain(`export const ${shim}`);
    }
  });

  it('keeps ORSet shim exports out of the domain module', async () => {
    const source = await readFile('src/domain/crdt/ORSet.ts', 'utf8');

    for (const shim of FORBIDDEN_ORSET_SHIMS) {
      expect(source).not.toContain(`export function ${shim}`);
      expect(source).not.toContain(`export const ${shim}`);
    }
  });
});
