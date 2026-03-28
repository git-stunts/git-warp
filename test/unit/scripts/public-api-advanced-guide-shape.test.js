import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const advancedGuide = readFileSync(
  fileURLToPath(new URL('../../../docs/ADVANCED_GUIDE.md', import.meta.url)),
  'utf8',
);

describe('Advanced Guide engine-room shape', () => {
  it('covers substrate boundaries, patch anatomy, and replay internals', () => {
    expect(advancedGuide).toContain('## Public roots and boundaries');
    expect(advancedGuide).toContain('## Patch anatomy');
    expect(advancedGuide).toContain('## How replay converges');
    expect(advancedGuide).toContain('## Git substrate layout');
    expect(advancedGuide).toContain('patch.cbor');
    expect(advancedGuide).toContain("Git's well-known empty tree");
  });

  it('covers trust and advanced inspection surfaces', () => {
    expect(advancedGuide).toContain('## Security and trust');
    expect(advancedGuide).toContain('[Audit receipt spec](specs/AUDIT_RECEIPT.md)');
    expect(advancedGuide).toContain('[Trust crypto spec](specs/TRUST_V1_CRYPTO.md)');
    expect(advancedGuide).toContain('## Advanced reads and inspection');
  });

  it('shows coordinate fact export with result shapes and links to the deeper docs', () => {
    expect(advancedGuide).toContain('exportCoordinateComparisonFact');
    expect(advancedGuide).toContain('exportCoordinateTransferPlanFact');
    expect(advancedGuide).toContain("factKind: 'coordinate-comparison'");
    expect(advancedGuide).toContain("factKind: 'coordinate-transfer-plan'");
    expect(advancedGuide).toContain('[API Reference](API_REFERENCE.md)');
    expect(advancedGuide).toContain('[Architecture](ARCHITECTURE.md)');
    expect(advancedGuide).toContain('OG-013');
    expect(advancedGuide).toContain('OG-014');
  });
});
