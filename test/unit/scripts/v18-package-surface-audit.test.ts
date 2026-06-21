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
const generatedIndexDeclarations = readText('dist/index.d.ts');

function packageModuleDoc(): string {
  const terminator = indexSource.indexOf('*/');
  if (terminator === -1) {
    throw new Error('index.ts is missing its package module JSDoc block');
  }
  return indexSource.slice(0, terminator + '*/'.length);
}

const moduleDoc = packageModuleDoc();

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

  it('exports the Worldline-first opener, handle, and option types from the root', () => {
    expect(indexSource).toContain('import WarpWorldline, { openWarpWorldline }');
    expect(indexSource).toContain('openWarpWorldline,');
    expect(indexSource).toContain('WarpWorldline,');
    expect(indexSource).toContain('ProjectionHandle,');
    expect(indexSource).not.toMatch(/^\s+Worldline,$/m);
    expect(indexSource).toContain('WarpWorldlineOpenOptions,');
    expect(indexSource).toContain('WarpWorldlinePatchBuild,');
  });

  it('keeps package hover docs on the Worldline-first example', () => {
    expect(moduleDoc).toContain('@example');
    expect(moduleDoc).toContain('openWarpWorldline');
    expect(moduleDoc).toContain("events.commit((patch) =>");
    expect(moduleDoc).toContain('events.live().getNodeProps');
    expect(moduleDoc).not.toContain('WarpApp.open(');
    expect(moduleDoc).not.toContain('app.createPatch(');
    expect(moduleDoc).not.toContain('app.materialize(');
  });

  it('keeps default export compatibility explicit', () => {
    expect(indexSource).toContain('export default WarpApp;');
    expect(indexSource).toContain('WarpApp remains the compatibility default export');
  });
});
