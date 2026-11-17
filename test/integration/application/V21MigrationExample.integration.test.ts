import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const README = fileURLToPath(new URL('../../../docs/migrations/v21/README.md', import.meta.url));
const ROOT_ENTRY = fileURLToPath(new URL('../../../index.ts', import.meta.url));
const ADVANCED_ENTRY = fileURLToPath(new URL('../../../advanced.ts', import.meta.url));
const MARKER = '<!-- v21-migration-example -->\n```ts\n';
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

/** The example exactly as published, with package specifiers bound to this checkout. */
async function publishedExample(): Promise<string> {
  const guide = await readFile(README, 'utf8');
  const start = guide.indexOf(MARKER);
  expect(start).toBeGreaterThan(-1);
  const body = guide.slice(start + MARKER.length, guide.indexOf('\n```', start + MARKER.length));
  return body
    // File URLs percent-encode double quotes, backslashes and line breaks.
    .replaceAll("'@git-stunts/git-warp/advanced'", `"${pathToFileURL(ADVANCED_ENTRY).href}"`)
    .replaceAll("'@git-stunts/git-warp'", `"${pathToFileURL(ROOT_ENTRY).href}"`);
}

it('runs the published v20-to-v21 migration example against a fresh repository', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'v21-migration-example-'));
  directories.push(directory);
  const repository = join(directory, 'repository');
  execFileSync('git', ['init', '-q', repository]);
  const module = join(directory, 'example.ts');
  await writeFile(module, await publishedExample());

  const example: { addAndListTodos(at: string): Promise<string[]> } = await import(pathToFileURL(module).href);
  const subjects = await example.addAndListTodos(repository);

  expect(subjects).toHaveLength(1);
  expect(subjects[0]).toMatch(/^todo:/u);
});
