import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const MIGRATION_SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.mjs', '.mts']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);

export async function* walkMigrationFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      yield* walkMigrationFiles(fullPath);
    } else if (MIGRATION_SOURCE_EXTENSIONS.has(extname(entry.name))) {
      yield fullPath;
    }
  }
}
