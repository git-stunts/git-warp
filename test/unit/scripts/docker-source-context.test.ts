import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const COMPOSE_FILES = Object.freeze([
  Object.freeze({ path: 'docker/docker-compose.yml', buildCount: 2 }),
  Object.freeze({ path: 'docker/docker-compose.watch.yml', buildCount: 1 }),
  Object.freeze({ path: 'docker/docker-compose.test.yml', buildCount: 3 }),
]);

const TEST_DOCKERFILES = Object.freeze([
  'docker/Dockerfile.node22',
  'docker/Dockerfile.node22-slim',
  'docker/Dockerfile.bun',
  'docker/Dockerfile.deno',
]);

const DEPENDENCY_INSTALL_DOCKERFILES = Object.freeze([
  'docker/Dockerfile.node22',
  'docker/Dockerfile.node22-slim',
  'docker/Dockerfile.bun',
  'docker/Dockerfile.deno',
  'docker/Dockerfile.benchmark',
]);

describe('Docker source context', () => {
  it('advertises only supported runtime routes in the full matrix', () => {
    const manifest = readFileSync(join(ROOT, 'package.json'), 'utf8');
    const matrix = readFileSync(join(ROOT, 'docker/docker-compose.test.yml'), 'utf8');

    expect(manifest).not.toContain('"test:node20"');
    expect(manifest).toMatch(/"node": ">=22\.0\.0"/u);
    expect(matrix).not.toContain('node20');
    expect(captureValues(matrix, /^ {2}(test-[^:]+):$/gmu))
      .toEqual(['test-node22', 'test-bun', 'test-deno']);
    expect(captureValues(matrix, /^ {4}profiles: \[(\w+), full\]$/gmu))
      .toEqual(['node22', 'bun', 'deno']);
    expect(existsSync(join(ROOT, 'docker/Dockerfile.node20'))).toBe(false);
  });

  it.each(COMPOSE_FILES)(
    '$path resolves every build from the invoking checkout root',
    ({ path, buildCount }) => {
      const composePath = join(ROOT, path);
      const source = readFileSync(composePath, 'utf8');
      const contexts = captureValues(source, /^\s+context:\s+(\S+)\s*$/gmu);
      const dockerfiles = captureValues(source, /^\s+dockerfile:\s+(\S+)\s*$/gmu);

      expect(contexts).toHaveLength(buildCount);
      expect(dockerfiles).toHaveLength(buildCount);
      for (const context of contexts) {
        expect(resolve(dirname(composePath), context)).toBe(resolve(ROOT));
      }
      for (const dockerfile of dockerfiles) {
        expect(dockerfile.startsWith('git-warp/')).toBe(false);
        expect(existsSync(join(ROOT, dockerfile))).toBe(true);
      }
    },
  );

  it.each(TEST_DOCKERFILES)(
    '%s copies only from the checkout-root build context',
    (path) => {
      const source = readFileSync(join(ROOT, path), 'utf8');

      expect(source).not.toMatch(/^COPY\s+git-warp(?:\/|\s)/mu);
      expect(source).toMatch(/^COPY\s+package\*\.json\s+\.\/$/mu);
      expect(source).toMatch(/^COPY\s+scripts\s+\.\/scripts$/mu);
      expect(source).toMatch(/^COPY\s+patches\s+\.\/patches$/mu);
      expect(source).toMatch(/^COPY\s+\.\s+\.\/?$/mu);
    },
  );

  it('excludes Git metadata and host dependencies at every depth of the Docker context', () => {
    const entries = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && !entry.startsWith('#'));

    expect(entries).toContain('**/.git');
    expect(entries).toContain('**/node_modules');
  });

  it('retains Markdown source contracts required by the unit suite', () => {
    const entries = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && !entry.startsWith('#'));

    expect(entries).not.toContain('*.md');
  });

  it('retains Git ignore policy before seeding the image repository', () => {
    const entries = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && !entry.startsWith('#'));

    expect(entries).not.toContain('.gitignore');
  });

  it.each(DEPENDENCY_INSTALL_DOCKERFILES)(
    '%s disables browser downloads before installing dependencies',
    (path) => {
      const source = readFileSync(join(ROOT, path), 'utf8');
      const skipDownload = source.indexOf('ENV PUPPETEER_SKIP_DOWNLOAD=true');
      const install = dependencyInstallOffset(source);

      expect(skipDownload).toBeGreaterThanOrEqual(0);
      expect(install).toBeGreaterThan(skipDownload);
    },
  );
});

function captureValues(source: string, pattern: RegExp): readonly string[] {
  return Object.freeze(
    [...source.matchAll(pattern)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined),
  );
}

function dependencyInstallOffset(source: string): number {
  const offsets = [source.indexOf('RUN npm ci'), source.indexOf('RUN npm install'),
    source.indexOf('RUN bun install')]
    .filter((offset) => offset >= 0);
  return Math.min(...offsets);
}
