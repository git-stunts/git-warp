import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import PublicSurfaceScanner from '../../../scripts/public-surface/PublicSurfaceScanner.ts';
import SurfaceRatchet, { PUBLIC_SURFACE_RATCHET_PATH } from '../../../scripts/public-surface/SurfaceRatchet.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';

it('matches the built package capability surface to its exact shrinking inventory', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const ratchet = SurfaceRatchet.parse(readFileSync(resolve(root, PUBLIC_SURFACE_RATCHET_PATH), 'utf8'));
  if (ratchet instanceof SurfaceRefusal) throw new Error(ratchet.reason);
  const findings = new PublicSurfaceScanner(root).scan();
  if (findings instanceof SurfaceRefusal) throw new Error(findings.reason);
  expect(ratchet.compare(findings)).toEqual([]);
}, 60_000);
