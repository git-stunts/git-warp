import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import inspectPackageBundle from '../../../scripts/package-payload/InspectPackageBundle.ts';
import PackagePayloadEntry from '../../../scripts/package-payload/PackagePayloadEntry.ts';
import PackagePayloadInventory from '../../../scripts/package-payload/PackagePayloadInventory.ts';

const roots: string[] = [];
const METADATA = '{"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js","default":"./dist/index.js"},"./testing":"./dist/testing.js","./package.json":"./package.json"},"bin":{"git-warp":"./bin/git-warp","migration":"./dist/migrate.js"},"dependencies":{"@scope/used":"^1.0.0"},"devDependencies":{"dev-only":"^1.0.0"}}';
const BASE_FILES = {
  'package.json': METADATA,
  'bin/git-warp': '#!/bin/sh',
  'dist/bin/git-warp.js': 'export {};',
  'dist/scripts/upgrade-v16-to-v17.js': 'export {};',
  'dist/migrate.js': 'export {};',
  'dist/testing.js': 'export {};',
  'dist/index.js': "import '@scope/used/feature'; import 'fs'; import 'node:path'; import './cycle.js'; import('./lazy.js');",
  'dist/cycle.js': "import './index.js';",
  'dist/lazy.js': 'export {};',
  'dist/index.d.ts': "export { Shape } from './shape.ts'; export { Extra } from './extra.js';",
  'dist/shape.d.ts': '/// <reference path="./extra.d.ts" />\nexport declare class Shape {}',
  'dist/extra.d.ts': 'export declare class Extra {}',
};

/** Builds a real file tree and its independently sized packed inventory. */
function fixture(overrides: Readonly<Record<string, string>> = {}): readonly [string, PackagePayloadInventory] {
  const root = mkdtempSync(join(tmpdir(), 'bundle-inspection-'));
  roots.push(root);
  const entries = Object.entries({ ...BASE_FILES, ...overrides }).map(([path, source]) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
    return new PackagePayloadEntry(path, new TextEncoder().encode(source).length);
  });
  return [root, new PackagePayloadInventory(100, entries.reduce((sum, entry) => sum + entry.size, 0), entries)];
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('traces cycles, dynamic literals, Node built-ins, and source-extension declarations without false positives', () => {
  expect(inspectPackageBundle(...fixture())).toEqual([]);
});

it('warns about unused files, dev-only imports, missing dependencies, and computed imports', () => {
  const findings = inspectPackageBundle(...fixture({
    'dist/index.js': "import 'dev-only'; import 'missing'; import './absent.js'; const target = './lazy.js'; import(target);",
    'dist/unreachable.js': 'export {};',
    'dist/private.d.ts': 'export declare const unused: number;',
  }));
  expect(findings).toEqual(expect.arrayContaining([
    'Required import has dev-only production dependency: dev-only',
    'Required import has undeclared production dependency: missing',
    'Possibly unused direct production dependency: @scope/used',
    'Computed import prevents complete reachability analysis: dist/index.js',
    'Missing supported module or relative import: dist/absent.js',
    'Possibly unnecessary JavaScript: dist/unreachable.js',
    'Unreachable public declaration: dist/private.d.ts',
  ]));
});

it.each(['file:../local', 'git+https://example.invalid/repo', '*', 'latest'])(
  'warns about a nonportable or unbounded requirement %s', (requirement) => {
    const metadata = METADATA.replace('^1.0.0', requirement);
    expect(inspectPackageBundle(...fixture({ 'package.json': metadata }))).toContain(
      `Review nonportable or unbounded dependency requirement: @scope/used@${requirement}`
    );
  }
);

it('never reads a module omitted from the packed inventory even when it exists on disk', () => {
  const [root, inventory] = fixture({ 'dist/index.js': "import '../unpublished.js';" });
  writeFileSync(join(root, 'unpublished.js'), "import 'must-not-be-read';");
  const findings = inspectPackageBundle(root, inventory);
  expect(findings).toContain('Missing supported module or relative import: unpublished.js');
  expect(findings.join('\n')).not.toContain('must-not-be-read');
});

it('validates metadata without dependency sections and reports required imports', () => {
  const metadata = METADATA.replace(',"dependencies":{"@scope/used":"^1.0.0"},"devDependencies":{"dev-only":"^1.0.0"}', '');
  expect(inspectPackageBundle(...fixture({ 'package.json': metadata }))).toContain(
    'Required import has undeclared production dependency: @scope/used'
  );
});

it('recognizes declared peer and optional imports instead of calling them missing', () => {
  const metadata = METADATA.replace('"dependencies":', '"peerDependencies":{"peer-lib":"^1"},"optionalDependencies":{"optional-lib":"^1"},"dependencies":');
  expect(inspectPackageBundle(...fixture({
    'package.json': metadata,
    'dist/index.js': BASE_FILES['dist/index.js'] + " import 'peer-lib'; import 'optional-lib';",
  }))).toEqual([]);
});
