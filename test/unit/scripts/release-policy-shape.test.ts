import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const releaseDoc = readFileSync(
  fileURLToPath(new URL('../../../docs/method/release.md', import.meta.url)),
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
  fileURLToPath(new URL('../../../docs/ROADMAP.md', import.meta.url)),
  'utf8',
);

describe('release policy shape', () => {
  it('keeps package and jsr versions aligned on the release branch', () => {
    expect(packageJson.version).toBe(jsrJson.version);
    expect(packageJson.version).toBe('17.0.0');
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

  it('keeps the roadmap header honest about the current release and correction patch', () => {
    expect(roadmap).toContain('**Current release on `main`:** v16.0.0');
    expect(roadmap).toContain('**Next intended release:** v16.0.1');
    expect(roadmap).toContain('v16.0.0 release');
  });

  it('keeps publish artifacts slim instead of shipping the full repo corpus', () => {
    expect(packageJson.files).not.toContain('docs');
    expect(packageJson.files).not.toContain('adr');
    expect(packageJson.files).not.toContain('.github/maintainers');
    expect(packageJson.files).not.toContain('ARCHITECTURE.md');
    expect(packageJson.files).toContain('CHANGELOG.md');

    expect(jsrJson.publish.include).not.toContain('docs/**/*');
    expect(jsrJson.publish.include).not.toContain('adr/**/*.md');
    expect(jsrJson.publish.include).not.toContain('.github/maintainers/**/*');
    expect(jsrJson.publish.include).not.toContain('ARCHITECTURE.md');
    expect(jsrJson.publish.include).toContain('CHANGELOG.md');
  });

  it('uses GitHub URLs for docs referenced from the packaged README', () => {
    const readme = readFileSync(
      fileURLToPath(new URL('../../../README.md', import.meta.url)),
      'utf8',
    );

    // The logo image must use an absolute raw.githubusercontent.com URL so it
    // renders on npm and jsr (which strip relative src attributes).
    expect(readme).toContain('https://raw.githubusercontent.com/git-stunts/git-warp/main/docs/images/git-warp-alt.svg');

    // The docs section links to key documents in the docs/ directory.
    expect(readme).toContain('docs/GETTING_STARTED.md');
    expect(readme).toContain('docs/GUIDE.md');
    expect(readme).toContain('docs/API_REFERENCE.md');
    expect(readme).toContain('docs/CLI_GUIDE.md');
    expect(readme).toContain('docs/ARCHITECTURE.md');
  });
});
