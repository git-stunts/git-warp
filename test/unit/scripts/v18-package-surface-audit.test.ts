import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readText(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

const packageJson = readText('package.json');
const jsrJson = readText('jsr.json');
const indexSource = readText('index.ts');

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

  it('exports the Worldline-first opener, handle, and option types from the root', () => {
    expect(indexSource).toContain('import WarpWorldline, { openWarpWorldline }');
    expect(indexSource).toContain('openWarpWorldline,');
    expect(indexSource).toContain('WarpWorldline,');
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
