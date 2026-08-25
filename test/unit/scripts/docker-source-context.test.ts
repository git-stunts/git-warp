import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const COMPOSE_FILES = Object.freeze([
  Object.freeze({ path: 'docker/docker-compose.yml', buildCount: 2 }),
  Object.freeze({ path: 'docker/docker-compose.test.yml', buildCount: 4 }),
]);

const TEST_DOCKERFILES = Object.freeze([
  'docker/Dockerfile.node20',
  'docker/Dockerfile.node22',
  'docker/Dockerfile.node22-slim',
  'docker/Dockerfile.bun',
  'docker/Dockerfile.deno',
]);

const DEPENDENCY_INSTALL_DOCKERFILES = Object.freeze([
  'docker/Dockerfile.node20',
  'docker/Dockerfile.node22',
  'docker/Dockerfile.node22-slim',
  'docker/Dockerfile.bun',
  'docker/Dockerfile.deno',
  'docker/Dockerfile.benchmark',
]);

describe('Docker source context', () => {
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

  it('excludes Git metadata from every checkout-root Docker build context', () => {
    const entries = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && !entry.startsWith('#'));

    expect(entries).toContain('.git');
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
