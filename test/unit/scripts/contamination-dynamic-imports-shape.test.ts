import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('dynamic import-law hygiene', () => {
  it('teaches the scanner and semgrep about dynamic import-law violations', () => {
    const contaminationMap = readRepoFile('scripts/contamination-map.ts');
    const semgrepPolicy = readRepoFile('semgrep/typescript-anti-sludge.yml');

    expect(contaminationMap).toContain('core-imports-node-protocol-dynamic');
    expect(contaminationMap).toContain('core-imports-infrastructure-dynamic');
    expect(contaminationMap).toContain("src/domain/utils/defaultCrypto.ts");
    expect(contaminationMap).toContain("src/domain/utils/defaultTrustCrypto.ts");
    expect(semgrepPolicy).toContain('ts-no-dynamic-node-imports-in-core');
    expect(semgrepPolicy).toContain('ts-no-dynamic-infrastructure-imports-in-core');
  });

  it('documents the narrow sanctioned dynamic adapter-loader carve-out', () => {
    const antiSludgePolicy = readRepoFile('docs/ANTI_SLUDGE_POLICY.md');

    expect(antiSludgePolicy).toContain('Authorized dynamic adapter-loader files');
    expect(antiSludgePolicy).toContain('src/domain/utils/defaultCrypto.ts');
    expect(antiSludgePolicy).toContain('src/domain/utils/defaultTrustCrypto.ts');
    expect(antiSludgePolicy).toContain('src/domain/utils/roaring.ts');
    expect(antiSludgePolicy).toContain('src/domain/services/controllers/SyncController.ts');
  });

  it('removes the hidden node platform imports from trust and roaring helpers', () => {
    const defaultTrustCrypto = readRepoFile('src/domain/utils/defaultTrustCrypto.ts');
    const roaring = readRepoFile('src/domain/utils/roaring.ts');

    expect(defaultTrustCrypto).not.toContain("node:crypto");
    expect(defaultTrustCrypto).toContain("TrustCryptoAdapter.ts");
    expect(roaring).not.toContain("node:module");
    expect(roaring).toContain("RoaringLoaderAdapter.ts");
  });
});
