import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const INVENTORY_RUNTIME = readFileSync(
  join(process.cwd(), 'src/application/RuntimeEntityAdmissionInventory.ts'),
  'utf8',
);

describe('entity admission inventory boundary ratchet', () => {
  it('narrows stream failures before constructing the application receipt', () => {
    expect(INVENTORY_RUNTIME).not.toContain('reject(reason: unknown)');
    expect(INVENTORY_RUNTIME).not.toContain('error: unknown');
    expect(INVENTORY_RUNTIME).toContain('error: WarpError | null');
  });
});
