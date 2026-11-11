import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import SurfaceRatchetHistory from '../../../scripts/public-surface/SurfaceRatchetHistory.ts';
import { PUBLIC_SURFACE_RATCHET_PATH } from '../../../scripts/public-surface/SurfaceRatchet.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';
import { PUBLIC_SURFACE_ROUTE_CHANGES_PATH } from '../../../scripts/public-surface/SurfaceRouteChange.ts';
import SurfacePackageFixture from '../../helpers/SurfacePackageFixture.ts';

const owned: SurfacePackageFixture[] = [];
afterEach(() => { for (const item of owned.splice(0)) item.dispose(); });

function git(item: SurfacePackageFixture, ...arguments_: string[]): void {
  execFileSync('git', ['-c', 'user.name=Surface fixture', '-c', 'user.email=surface@example.invalid', ...arguments_], {
    cwd: item.root, timeout: 10_000, stdio: 'pipe',
  });
}

function fixture(inventory: string | null): SurfacePackageFixture {
  const item = SurfacePackageFixture.create();
  owned.push(item);
  git(item, 'init', '-b', 'main');
  git(item, 'add', '--', 'package.json', 'index.d.ts');
  if (inventory !== null) {
    item.write(PUBLIC_SURFACE_RATCHET_PATH, inventory);
    item.write('scripts/public-surface/guard.ts', 'export {};');
    git(item, 'add', '--', PUBLIC_SURFACE_RATCHET_PATH, 'scripts/public-surface/guard.ts');
  }
  git(item, 'commit', '-m', 'fixture base');
  git(item, 'switch', '-c', 'candidate');
  return item;
}

describe('public surface history gate', () => {
  it('permits the explicit introduction when both guard and baseline were absent', () => {
    const item = fixture(null);
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\tlegacy\n');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toEqual([]);
  });

  it('permits shrinking an existing inventory', () => {
    const item = fixture('1054\tlegacy\n');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toEqual([]);
  });

  it('rejects growth hidden before the last commit', () => {
    const item = fixture('1054\tlegacy\n');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\tlegacy\n1054\tnew\n');
    git(item, 'add', '--', PUBLIC_SURFACE_RATCHET_PATH);
    git(item, 'commit', '-m', 'grow inventory');
    git(item, 'commit', '--allow-empty', '-m', 'unrelated followup');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toEqual(['1054\tnew']);
  });

  it('admits a listed route move of a removed base row', () => {
    const item = fixture('1054\t. Lane Lane.old basis\n');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\t. Lane Lane.new basis\n');
    item.write(PUBLIC_SURFACE_ROUTE_CHANGES_PATH, '# moved\n. Lane Lane.new basis\t. Lane Lane.old basis\n');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toEqual([]);
  });

  it('rejects a listed move whose old row is still present or never existed', () => {
    const kept = fixture('1054\t. Lane Lane.old basis\n');
    kept.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\t. Lane Lane.old basis\n1054\t. Lane Lane.new basis\n');
    kept.write(PUBLIC_SURFACE_ROUTE_CHANGES_PATH, '. Lane Lane.new basis\t. Lane Lane.old basis\n');
    expect(new SurfaceRatchetHistory(kept.root).check('main')).toEqual(['1054\t. Lane Lane.new basis']);
    const invented = fixture('1054\t. Lane Lane.other basis\n');
    invented.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\t. Lane Lane.new basis\n');
    invented.write(PUBLIC_SURFACE_ROUTE_CHANGES_PATH, '. Lane Lane.new basis\t. Lane Lane.old basis\n');
    expect(new SurfaceRatchetHistory(invented.root).check('main')).toEqual(['1054\t. Lane Lane.new basis']);
  });

  it.each([
    ['another export', '. Lane Lane.new basis\t. Runtime Lane.old basis\n'],
    ['another rule', '. Lane Lane.new basis\t. Lane Lane.old lane\n'],
    ['an unchanged route', '. Lane Lane.old basis\t. Lane Lane.old basis\n'],
    ['a malformed line', '. Lane Lane.new basis\n'],
    ['a short key', '. Lane basis\t. Lane basis2\n'],
    ['a duplicate move', '. Lane Lane.a basis\t. Lane Lane.old basis\n. Lane Lane.b basis\t. Lane Lane.old basis\n'],
  ])('refuses a route change to %s', (_label, changes) => {
    const item = fixture('1054\t. Lane Lane.old basis\n');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\t. Lane Lane.new basis\n');
    item.write(PUBLIC_SURFACE_ROUTE_CHANGES_PATH, changes);
    expect(new SurfaceRatchetHistory(item.root).check('main')).toBeInstanceOf(SurfaceRefusal);
  });

  it('refuses a missing comparison reference', () => {
    const item = fixture('1054\tlegacy\n');
    expect(new SurfaceRatchetHistory(item.root).check('missing')).toBeInstanceOf(SurfaceRefusal);
  });

  it('refuses to bootstrap after an existing guard lost its baseline', () => {
    const item = fixture('1054\tlegacy\n');
    git(item, 'switch', 'main');
    git(item, 'rm', '--', PUBLIC_SURFACE_RATCHET_PATH);
    git(item, 'commit', '-m', 'remove baseline');
    git(item, 'switch', '-c', 'later');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\tnew\n');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toBeInstanceOf(SurfaceRefusal);
  });

  it('refuses a missing or malformed current inventory', () => {
    const item = fixture(null);
    expect(new SurfaceRatchetHistory(item.root).check('main')).toBeInstanceOf(SurfaceRefusal);
    item.write(PUBLIC_SURFACE_RATCHET_PATH, 'not an allowance');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toBeInstanceOf(SurfaceRefusal);
  });

  it('refuses a reset after both guard and inventory were deleted', () => {
    const item = fixture('1054\tlegacy\n');
    git(item, 'switch', 'main');
    git(item, 'rm', '-r', '--', PUBLIC_SURFACE_RATCHET_PATH, 'scripts/public-surface');
    git(item, 'commit', '-m', 'remove entire guard');
    git(item, 'switch', '-c', 'later');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\tnew\n');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toBeInstanceOf(SurfaceRefusal);
  });

  it('refuses a reset when a merge deletes the guard relative to only one parent', () => {
    const item = fixture(null);
    git(item, 'commit', '--allow-empty', '-m', 'unrelated unguarded branch');
    git(item, 'switch', 'main');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\tlegacy\n');
    item.write('scripts/public-surface/guard.ts', 'export {};');
    git(item, 'add', '--', PUBLIC_SURFACE_RATCHET_PATH, 'scripts/public-surface/guard.ts');
    git(item, 'commit', '-m', 'introduce guard');
    git(item, 'merge', '--no-commit', '--no-ff', 'candidate');
    git(item, 'rm', '-r', '--', PUBLIC_SURFACE_RATCHET_PATH, 'scripts/public-surface');
    git(item, 'commit', '-m', 'merge without guard');
    git(item, 'switch', '-c', 'later');
    item.write(PUBLIC_SURFACE_RATCHET_PATH, '1054\tnew\n');
    expect(new SurfaceRatchetHistory(item.root).check('main')).toBeInstanceOf(SurfaceRefusal);
  });
});
