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

  it('keeps default export compatibility explicit', () => {
    expect(indexSource).toContain('export default WarpApp;');
    expect(indexSource).toContain('WarpApp remains the compatibility default export');
  });
});
