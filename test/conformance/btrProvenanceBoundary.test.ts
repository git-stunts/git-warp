import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const DESIGN_PATH = 'docs/design/0099-btr-provenance-codec-boundary-repair.md';
const BTR_PATH = 'src/domain/services/provenance/BTR.ts';
const BTR_OPERATIONS_PATH = 'src/domain/services/provenance/btrOperations.ts';
const PROVENANCE_PAYLOAD_PATH = 'src/domain/services/provenance/ProvenancePayload.ts';

const OFFENDER_FILES = [
  BTR_PATH,
  BTR_OPERATIONS_PATH,
  PROVENANCE_PAYLOAD_PATH,
] as const;

const OWNERSHIP_TEST_PATH = 'test/conformance/btrSigningBytesOwnership.test.ts';
const SLUDGE_ATLAS_TEST_PATH = 'test/conformance/sludgeAtlas.test.ts';

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function sourceFor(path: string): string {
  return readRepoFile(path);
}

function expectNoPattern(source: string, pattern: RegExp, label: string): void {
  expect(source, label).not.toMatch(pattern);
}

describe('BTR provenance boundary repair contract', () => {
  it('keeps the ownership and sludge-atlas doctrine tests present', () => {
    expect(readRepoFile(OWNERSHIP_TEST_PATH)).toContain('BTR signing-byte ownership doctrine');
    expect(readRepoFile(SLUDGE_ATLAS_TEST_PATH)).toContain('sludge atlas contract');
  });

  it('records the inherited doctrine in the 0099 design', () => {
    const design = readRepoFile(DESIGN_PATH);

    expect(design).toContain('Domain owns meaning. Adapters own encoding. Ports define capabilities.');
    expect(design).toContain('Crypto signs typed canonical bytes.');
    expect(design).toContain('Decision: keep `CryptoPort.hmac` generic and byte-oriented for this');
    expect(design).toContain('`BtrSigningBytes` construction must be guarded');
    expect(design).toContain('Do not resume `0096-purge-cast-hacks`');
  });

  it('removes boundary codec imports and calls from known offender files', () => {
    for (const path of OFFENDER_FILES) {
      const source = sourceFor(path);

      expectNoPattern(source, /\bCodecPort\b/, `${path}: CodecPort`);
      expectNoPattern(source, /\bdefaultCodec\b/, `${path}: defaultCodec`);
      expectNoPattern(source, /\bcodec\.encode\b/, `${path}: codec.encode`);
      expectNoPattern(source, /\bcodec\.decode\b/, `${path}: codec.decode`);
    }
  });

  it('removes domain-owned wire API names from BTR/provenance values', () => {
    for (const path of OFFENDER_FILES) {
      const source = sourceFor(path);

      expectNoPattern(source, /\bserialize\s*\(/, `${path}: serialize(`);
      expectNoPattern(source, /\bdeserialize\s*\(/, `${path}: deserialize(`);
      expectNoPattern(source, /\btoJSON\s*\(/, `${path}: toJSON(`);
      expectNoPattern(source, /\bfromJSON\s*\(/, `${path}: fromJSON(`);
    }
  });

  it('removes anonymous BTR/provenance bags and fake wire models', () => {
    for (const path of OFFENDER_FILES) {
      const source = sourceFor(path);

      expectNoPattern(source, /\bPatchEntryJSON\b/, `${path}: PatchEntryJSON`);
      expectNoPattern(source, /\bRecord\s*<\s*string\b/, `${path}: Record<string`);
    }
  });

  it('removes cast-theater bridges from known offender files', () => {
    for (const path of OFFENDER_FILES) {
      const source = sourceFor(path);

      expectNoPattern(source, /\bas\s+unknown\s+as\s+PatchEntry\b/, `${path}: as unknown as PatchEntry`);
      expectNoPattern(source, /\bas\s+unknown\s+as\s+BTRFields\b/, `${path}: as unknown as BTRFields`);
      expectNoPattern(source, /\bas\s+unknown\s+as\b/, `${path}: as unknown as`);
    }
  });

  it('removes HMAC object-bag signing from btrOperations', () => {
    const source = sourceFor(BTR_OPERATIONS_PATH);

    expectNoPattern(source, /\bcomputeHmac\s*\(\s*fields\b/, 'computeHmac(fields');
    expectNoPattern(source, /\bcodec\.encode\s*\(\s*fields\b/, 'codec.encode(fields)');
    expectNoPattern(source, /\bfields\s*:\s*\{/, 'fields: {');
    expectNoPattern(source, /\bP\s*:\s*readonly\s+Record\b/, 'P: readonly Record');
  });
});
