import { createHash } from 'node:crypto';
import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { z } from 'zod';

type DeclarationInstallation =
  | { readonly status: 'installed' | 'unchanged' }
  | { readonly status: 'refused'; readonly reason: string };

const PACKAGE = z.object({ name: z.literal('@git-stunts/trailer-codec'), version: z.literal('2.1.1') });
const DECLARATION_SHA256 = 'a992444bffadbfb020f55c44cff5e0471f687cd9f45b6726a0e2dc9f10d5f031';

/** Install the reviewed declaration payload without modifying dependency runtime. */
export default class TrailerCodecDeclarationInstaller {
  readonly #directory: string;
  readonly #source: URL;

  constructor(root: string, source = new URL('../patches/trailer-codec-index.d.ts.txt', import.meta.url)) {
    this.#directory = resolve(root, 'node_modules/@git-stunts/trailer-codec');
    this.#source = new URL(source);
  }

  install(): DeclarationInstallation {
    const manifestPath = resolve(this.#directory, 'package.json');
    const readPackage = createRequire(import.meta.url);
    const resolvedManifest = readPackage.resolve(manifestPath);
    // The native JSON loader validates syntax; discard only this metadata cache.
    delete readPackage.cache[resolvedManifest];
    const manifest = PACKAGE.safeParse(readPackage(resolvedManifest));
    if (!manifest.success) {
      return { status: 'refused', reason: 'Expected @git-stunts/trailer-codec@2.1.1' };
    }
    const declarations = readFileSync(this.#source);
    if (createHash('sha256').update(declarations).digest('hex') !== DECLARATION_SHA256) {
      return { status: 'refused', reason: 'Reviewed trailer-codec declarations changed' };
    }
    const target = resolve(this.#directory, 'index.d.ts');
    try {
      return this.#existing(target, declarations);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      return this.#publish(target, declarations);
    }
  }

  #existing(target: string, declarations: Uint8Array): DeclarationInstallation {
    return readFileSync(target).equals(declarations)
      ? { status: 'unchanged' }
      : { status: 'refused', reason: 'Conflicting trailer-codec declarations' };
  }

  #publish(target: string, declarations: Uint8Array): DeclarationInstallation {
    // The same-filesystem private file is complete before its no-clobber link.
    const staging = mkdtempSync(resolve(this.#directory, '.trailer-codec-declaration-'));
    const staged = resolve(staging, 'index.d.ts');
    let result: DeclarationInstallation;
    try {
      writeFileSync(staged, declarations, { flag: 'wx', mode: 0o644 });
      result = this.#link(staged, target, declarations);
    } catch (error) {
      try {
        rmSync(staging, { recursive: true, force: true });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Declaration publication and staging cleanup failed');
      }
      throw error;
    }
    rmSync(staging, { recursive: true, force: true });
    return result;
  }

  #link(staged: string, target: string, declarations: Uint8Array): DeclarationInstallation {
    try {
      linkSync(staged, target);
      return { status: 'installed' };
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      return this.#existing(target, declarations);
    }
  }
}
