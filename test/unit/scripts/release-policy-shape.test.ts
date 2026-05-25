import { existsSync, readFileSync } from 'node:fs';
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
const packedArtifactSmokePath = fileURLToPath(
  new URL('../../../scripts/smoke-packed-artifact.sh', import.meta.url),
);
const packedArtifactSmoke = existsSync(packedArtifactSmokePath)
  ? readFileSync(packedArtifactSmokePath, 'utf8')
  : '';
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
    expect(packageJson.version).toBe('18.0.0');
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
    expect(roadmap).toContain('**Current release on `main`:** v17.0.1');
    expect(roadmap).toContain('**Next intended release:** v18.0.0');
    expect(roadmap).toContain('v17.0.1 patch');
  });

  it('keeps publish artifacts slim instead of shipping the full repo corpus', () => {
    expect(packageJson.files).toContain('dist');
    expect(packageJson.files).toContain('bin/git-warp');
    expect(packageJson.files).not.toContain('src');
    expect(packageJson.files).not.toContain('bin/cli');
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

  it('publishes compiled npm artifacts while keeping JSR on TypeScript source', () => {
    expect(packageJson.main).toBe('./dist/index.js');
    expect(packageJson.types).toBe('./dist/index.d.ts');
    expect(packageJson.bin['warp-graph']).toBe('./dist/bin/warp-graph.js');

    expect(packageJson.exports['.'].import).toBe('./dist/index.js');
    expect(packageJson.exports['.'].types).toBe('./dist/index.d.ts');
    expect(packageJson.exports['./browser'].import).toBe('./dist/browser.js');
    expect(packageJson.exports['./browser'].types).toBe('./dist/browser.d.ts');
    expect(packageJson.exports['./sha1sync'].import).toBe(
      './dist/src/infrastructure/adapters/sha1sync.js',
    );
    expect(packageJson.exports['./sha1sync'].types).toBe(
      './dist/src/infrastructure/adapters/sha1sync.d.ts',
    );

    expect(jsrJson.exports['.']).toBe('./index.ts');
    expect(jsrJson.exports['./browser']).toBe('./browser.ts');
    expect(jsrJson.exports['./sha1sync']).toBe('./src/infrastructure/adapters/sha1sync.ts');
  });

  it('smokes the packed npm artifact before release tagging', () => {
    expect(existsSync(packedArtifactSmokePath)).toBe(true);
    expect(preflight).toContain('scripts/smoke-packed-artifact.sh');
    expect(preflight).toContain('packed artifact smoke');

    expect(packedArtifactSmoke).toContain('npm run build --silent');
    expect(packedArtifactSmoke).toContain('npm pack --pack-destination');
    expect(packedArtifactSmoke).toContain('npm install --no-audit --no-fund');
    expect(packedArtifactSmoke).toContain("import('@git-stunts/git-warp')");
    expect(packedArtifactSmoke).toContain('warp-graph --help');
    expect(packedArtifactSmoke).toContain('git-warp --help');
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
