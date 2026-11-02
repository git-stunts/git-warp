import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Disposable package metadata and source; scanner tests never execute fixture code. */
export default class SurfacePackageFixture {
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
    Object.freeze(this);
  }

  static create(): SurfacePackageFixture {
    const fixture = new SurfacePackageFixture(mkdtempSync(join(tmpdir(), 'warp-public-surface-')));
    fixture.write('package.json', '{"type":"module","exports":{".":"./index.d.ts"}}');
    fixture.write('index.d.ts', 'export type Reading = { readonly value: string };');
    return fixture;
  }

  write(path: string, text: string): void {
    const file = join(this.root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}
