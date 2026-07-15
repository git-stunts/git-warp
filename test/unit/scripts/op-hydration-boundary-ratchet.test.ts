import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function source(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('op hydration boundary ratchet', () => {
  it('keeps decoded patch hydration at storage and codec boundaries', () => {
    const cborAdapter = source('src/infrastructure/adapters/CborPatchJournalAdapter.ts');
    const btrAdapter = source('src/infrastructure/adapters/BtrCodecAdapter.ts');
    const patchDiscovery = source('src/domain/services/controllers/PatchDiscovery.ts');

    expect(cborAdapter).toContain("import { hydrateDecodedPatch } from '../../domain/services/PatchHydrator.ts';");
    expect(cborAdapter).toContain('return hydrateDecodedPatch(this.#codec.decode(bytes));');

    expect(btrAdapter).toContain("import { hydrateDecodedPatch } from '../../domain/services/PatchHydrator.ts';");
    expect(btrAdapter).toContain("patch: hydrateDecodedPatch(source['patch']),");

    expect(patchDiscovery).toContain("import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';");
    expect(patchDiscovery).toContain('patch: await journal.readPatch(patchMeta)');
    expect(patchDiscovery).not.toContain('hydrateDecodedPatch');
  });

  it('keeps decoded ops runtime-backed before patch construction', () => {
    const hydrator = source('src/domain/services/PatchHydrator.ts');
    const normalizer = source('src/domain/services/OpNormalizer.ts');

    expect(hydrator).toContain("import { hydrateKnownDecodedOp } from './OpNormalizer.ts';");
    expect(hydrator).toContain('normalized.push(hydrateKnownDecodedOp(normalizeDecodedOp(rawOp)));');
    expect(normalizer).toContain('if (isRuntimeOp(hydratedOp)) {');
    expect(normalizer).toContain("throw new PatchError(`Cannot hydrate unknown decoded op type '${rawOp.type}'`");
  });
});
