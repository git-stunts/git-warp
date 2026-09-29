import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import PackedArtifactBoundaryAdapter from '../../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';

const CHANGELOG = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
const PACKAGE_PAYLOAD_CONTRACT = readFileSync(
  new URL('../../../docs/operations/package-payload.md', import.meta.url),
  'utf8'
);
const PACKAGE_FILES = readPackageFiles();
const PUBLISHED_DOCUMENTS = PACKAGE_FILES.filter((entry) => entry.endsWith('.md'));
const REPOSITORY_URL_PATTERN =
  /^https:\/\/github\.com\/git-stunts\/git-warp\/(?:blob|tree)\/(?<ref>[^/]+)\//u;
const IMMUTABLE_REF_PATTERN = /^(?:[0-9a-f]{40}|v\d+\.\d+\.\d+)$/u;

/** Validates the publication allowlist before checking documentation targets. */
function readPackageFiles(): readonly string[] {
  const { files } = new PackedArtifactBoundaryAdapter().read(
    'package.json', z.object({ files: z.array(z.string()) })
  );
  return files;
}

/** Collects inline and reference links from retained documentation. */
function markdownLinkTargets(markdown: string): string[] {
  const inline = [...markdown.matchAll(/\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu)];
  const references = [...markdown.matchAll(/^\s*\[[^\]]+\]:\s*(?<target>\S+)/gmu)];
  return [...inline, ...references].map((match) => match.groups?.['target'] ?? '');
}

/** Identifies URLs and same-document anchors that need no packaged file. */
function isExternalTarget(target: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/iu.test(target);
}

/** Resolves a documentation target relative to its packaged document. */
function packageRelativeTarget(document: string, target: string): string {
  const withoutFragment = target.split('#')[0] ?? '';
  return posix.normalize(posix.join(posix.dirname(document), withoutFragment));
}

/** Accepts a listed file or a directory with a listed README. */
function isPublishedTarget(target: string): boolean {
  const trimmed = target.endsWith('/') ? target.slice(0, -1) : target;
  return PACKAGE_FILES.includes(trimmed) || PACKAGE_FILES.includes(`${trimmed}/README.md`);
}

describe('package payload contract documentation', () => {
  it('distinguishes published operator policy from excluded maintainer-only policy', () => {
    expect(CHANGELOG).toContain(
      'drivers, maintainer-only policy documents, and plans.'
    );
    expect(CHANGELOG).not.toContain('drivers, policy documents, and plans.');
  });

  it('names the complete v18-to-v19 adapter publication path', () => {
    expect(PACKAGE_PAYLOAD_CONTRACT).toContain(
      '`dist/scripts/v18-to-v19/*.js`, `dist/scripts/v18-to-v19/adapters/**/*.js`'
    );
    expect(PACKAGE_PAYLOAD_CONTRACT).not.toContain('`adapters/**`');
    expect(PACKAGE_PAYLOAD_CONTRACT).not.toContain('{js,d.ts}`, `dist/scripts');
  });

  it('publishes executable implementation as JavaScript only', () => {
    const implementationEntries = PACKAGE_FILES.filter(
      (entry) => entry.startsWith('dist/bin') || entry.startsWith('dist/scripts')
    );

    expect(implementationEntries.length).toBeGreaterThan(0);
    expect(implementationEntries.filter((entry) => !entry.endsWith('.js'))).toEqual([]);
  });

  it('publishes only the retained documentation set', () => {
    expect(PUBLISHED_DOCUMENTS).toEqual([
      'docs/migrations/v19/README.md',
      'docs/READINGS_AND_OPTICS.md',
      'README.md',
    ]);
    expect(PACKAGE_FILES).not.toContain('CHANGELOG.md');
    expect(PACKAGE_FILES.filter((entry) => entry.startsWith('docs/topics'))).toEqual([]);
    expect(PACKAGE_FILES.filter((entry) => entry.startsWith('docs/operations'))).toEqual([]);
  });

  it.each(PUBLISHED_DOCUMENTS)('keeps package-relative links in %s inside the package', (document) => {
    const markdown = readFileSync(new URL(`../../../${document}`, import.meta.url), 'utf8');
    const escaping = markdownLinkTargets(markdown)
      .filter((target) => !isExternalTarget(target))
      .map((target) => packageRelativeTarget(document, target))
      .filter((target) => !isPublishedTarget(target));

    expect(escaping).toEqual([]);
  });

  it.each(PUBLISHED_DOCUMENTS)('pins repository documentation links in %s', (document) => {
    const markdown = readFileSync(new URL(`../../../${document}`, import.meta.url), 'utf8');
    const mutable = markdownLinkTargets(markdown)
      .map((target) => REPOSITORY_URL_PATTERN.exec(target)?.groups?.['ref'])
      .filter((ref): ref is string => ref !== undefined && !IMMUTABLE_REF_PATTERN.test(ref));

    expect(mutable).toEqual([]);
  });
});
