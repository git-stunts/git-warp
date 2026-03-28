import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const releaseDoc = readFileSync(
  fileURLToPath(new URL('../../../docs/release.md', import.meta.url)),
  'utf8',
);
const preflight = readFileSync(
  fileURLToPath(new URL('../../../scripts/release-preflight.sh', import.meta.url)),
  'utf8',
);
const releaseWorkflow = readFileSync(
  fileURLToPath(new URL('../../../.github/workflows/release.yml', import.meta.url)),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../../package.json', import.meta.url)),
  'utf8',
));
const jsrJson = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../../jsr.json', import.meta.url)),
  'utf8',
));
const roadmap = readFileSync(
  fileURLToPath(new URL('../../../ROADMAP.md', import.meta.url)),
  'utf8',
);

describe('release policy shape', () => {
  it('keeps package and jsr versions aligned on the release branch', () => {
    expect(packageJson.version).toBe(jsrJson.version);
    expect(packageJson.version).toBe('15.0.0');
  });

  it('does not require a README release feed anymore', () => {
    expect(releaseDoc).not.toContain('README "What\'s New"');
    expect(releaseDoc).toContain('The README no longer carries a per-release `What\'s New` section.');
    expect(preflight).not.toContain("README 'What's New'");
    expect(releaseWorkflow).not.toContain('Verify README What\'s New section');
  });

  it('documents the normal branch -> PR -> merge -> tag release loop', () => {
    expect(releaseDoc).toContain('Push the release-prep branch and open a PR to `main`.');
    expect(releaseDoc).toContain('Merge to `main` after review and green CI.');
  });

  it('keeps the roadmap header honest about main versus the unreleased v15 branch', () => {
    expect(roadmap).toContain('**Current release on `main`:** v14.16.2');
    expect(roadmap).toContain('**Next intended release:** v15.0.0');
    expect(roadmap).toContain('`OG-010` remains active');
  });
});
