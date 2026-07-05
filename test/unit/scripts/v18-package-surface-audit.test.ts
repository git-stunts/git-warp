import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function repoPath(relativePath: string): string {
  return fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
}

function readText(relativePath: string): string {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function lineCount(source: string): number {
  return source.split('\n').length;
}

const packageJson = readText('package.json');
const jsrJson = readText('jsr.json');
const tsconfigPublish = readText('tsconfig.publish.json');
const indexSource = readText('index.ts');
const legacySource = readText('legacy.ts');
const generatedIndexDeclarations = readText('dist/index.d.ts');

function moduleDoc(source: string, sourceName: string): string {
  const terminator = source.indexOf('*/');
  if (terminator === -1) {
    throw new Error(`${sourceName} is missing its package module JSDoc block`);
  }
  return source.slice(0, terminator + '*/'.length);
}

const indexModuleDoc = moduleDoc(indexSource, 'index.ts');
const legacyModuleDoc = moduleDoc(legacySource, 'legacy.ts');

describe('v18 package surface audit', () => {
  it('positions the registry package around the Worldline-first API', () => {
    expect(packageJson).toContain(
      '"description": "Worldline-first WARP graph over Git: deterministic multi-writer causal history, readings, and tooling."',
    );
    expect(packageJson).toContain('"worldline"');
    expect(packageJson).toContain('"local-first"');
    expect(packageJson).toContain('"crdt"');
  });

  it('keeps npm and JSR root exports pointed at the public barrel', () => {
    expect(packageJson).toContain('"types": "./dist/index.d.ts"');
    expect(packageJson).toContain('"import": "./dist/index.js"');
    expect(packageJson).toContain('"default": "./dist/index.js"');
    expect(jsrJson).toContain('".": "./index.ts"');
  });

  it('keeps the legacy root declaration monolith retired', () => {
    expect(existsSync(repoPath('index.d.ts'))).toBe(false);
    expect(packageJson).not.toContain('"types": "./index.d.ts"');
    expect(tsconfigPublish).toContain('"declaration": true');
    expect(lineCount(generatedIndexDeclarations)).toBeLessThanOrEqual(500);
  });

  it('moves the Worldline-first opener, handle, and option types to legacy', () => {
    expect(indexSource).not.toContain('import WarpWorldline, { openWarpWorldline }');
    expect(legacySource).toContain('import WarpWorldline, { openWarpWorldline }');
    expect(legacySource).toContain('openWarpWorldline,');
    expect(legacySource).toContain('WarpWorldline,');
    expect(legacySource).toContain('ProjectionHandle,');
    expect(legacySource).not.toMatch(/^\s+Worldline,$/m);
    expect(legacySource).toContain('WarpWorldlineOpenOptions,');
    expect(legacySource).toContain('WarpWorldlinePatchBuild,');
  });

  it('keeps package hover docs on the v19 boundary story', () => {
    expect(indexModuleDoc).toContain('Public v19 application boundary');
    expect(indexModuleDoc).toContain('write intents, read timelines, and keep receipts');
    expect(indexModuleDoc).toContain('@git-stunts/git-warp/legacy');
    expect(indexModuleDoc).toContain('@git-stunts/git-warp/storage');
    expect(indexModuleDoc).not.toContain('openWarpWorldline');
    expect(indexModuleDoc).not.toContain('WarpApp.open(');
    expect(indexModuleDoc).not.toContain('app.materialize(');
  });

  it('keeps legacy hover docs on the Worldline-first example', () => {
    expect(legacyModuleDoc).toContain('@example');
    expect(legacyModuleDoc).toContain('openWarpWorldline');
    expect(legacyModuleDoc).toContain("events.commit((patch) =>");
    expect(legacyModuleDoc).toContain('events.live().getNodeProps');
    expect(legacyModuleDoc).not.toContain('WarpApp.open(');
    expect(legacyModuleDoc).not.toContain('app.createPatch(');
    expect(legacyModuleDoc).not.toContain('app.materialize(');
  });

  it('keeps legacy default export compatibility explicit', () => {
    expect(indexSource).not.toContain('export default WarpApp;');
    expect(legacySource).toContain('export default WarpApp;');
    expect(legacySource).toContain('WarpApp remains the compatibility default export');
  });
});
