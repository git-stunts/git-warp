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
const releaseGuardPath = fileURLToPath(
  new URL('../../../scripts/release-guard.sh', import.meta.url),
);
const releaseGuard = existsSync(releaseGuardPath)
  ? readFileSync(releaseGuardPath, 'utf8')
  : '';
const releaseEvidenceTemplatePath = fileURLToPath(
  new URL('../../../docs/checklists/release-evidence-template.md', import.meta.url),
);
const releaseEvidenceTemplate = existsSync(releaseEvidenceTemplatePath)
  ? readFileSync(releaseEvidenceTemplatePath, 'utf8')
  : '';
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
const architectureDoc = readFileSync(
  fileURLToPath(new URL('../../../docs/ARCHITECTURE.md', import.meta.url)),
  'utf8',
);
const readingIdentitySpecPath = fileURLToPath(
  new URL('../../../docs/specs/READING_IDENTITY.md', import.meta.url),
);
const readingIdentitySpec = existsSync(readingIdentitySpecPath)
  ? readFileSync(readingIdentitySpecPath, 'utf8')
  : '';
const canonicalFixturesDocPath = fileURLToPath(
  new URL('../../../docs/method/canonical-fixtures.md', import.meta.url),
);
const canonicalFixturesDoc = existsSync(canonicalFixturesDocPath)
  ? readFileSync(canonicalFixturesDocPath, 'utf8')
  : '';
const goalpostGuardPath = fileURLToPath(
  new URL('../../../scripts/goalpost-guard.sh', import.meta.url),
);
const goalpostGuard = existsSync(goalpostGuardPath)
  ? readFileSync(goalpostGuardPath, 'utf8')
  : '';
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
const roadmapPlanning = readFileSync(
  fileURLToPath(new URL('../../../docs/method/roadmap-planning.md', import.meta.url)),
  'utf8',
);
const v18GoalpostPaths = [
  '../../../docs/method/roadmap/v18.0.0/v18-gp1-optics-public-api-closeout.md',
  '../../../docs/method/roadmap/v18.0.0/v18-gp2-bounded-memory-large-graph-gate.md',
  '../../../docs/method/roadmap/v18.0.0/v18-gp3-content-attachment-plane-honesty.md',
  '../../../docs/method/roadmap/v18.0.0/v18-gp4-holographic-slicing-checkpoint-basis.md',
  '../../../docs/method/roadmap/v18.0.0/v18-gp5-release-operation-evidence.md',
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

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
    expect(releaseDoc).toContain('Fast-forward local `main`, fetch `origin/main`, and rerun final preflight');
    expect(packageJson.scripts['release:prep']).toBe('bash scripts/release-preflight.sh --stage prep-pr');
    expect(packageJson.scripts['release:preflight']).toBe('bash scripts/release-preflight.sh --stage final-local');
    expect(preflight).toContain('bash scripts/release-guard.sh --stage "$STAGE" --tag "v${PKG}"');
    expect(preflight).toContain('git status --porcelain');
  });

  it('locks release tags behind issue gates and prior-release cleanup', () => {
    expect(existsSync(releaseGuardPath)).toBe(true);
    expect(packageJson.scripts['release:guard']).toBe('bash scripts/release-guard.sh');
    expect(releaseGuard).toContain('prep-pr | final-local | tag-workflow | rerun-workflow');
    expect(releaseGuard).toContain('check_stage_issue_gates');
    expect(releaseGuard).toContain('check_origin_main_ancestor');
    expect(releaseGuard).toContain('prereleaseRank = { alpha: 0, beta: 1, rc: 2 }');
    expect(releaseWorkflow).toContain('STAGE="rerun-workflow"');
    expect(releaseWorkflow).toContain('STAGE="tag-workflow"');
    expect(releaseWorkflow).toContain('npm run release:guard -- --stage "$STAGE" --tag "${{ steps.meta.outputs.tag }}"');
    expect(releaseWorkflow).toContain('persist-credentials: false');

    expect(releaseDoc).toContain('Tag-time release law');
    expect(releaseDoc).toContain('The guard is stage-aware');
    expect(releaseDoc).toContain('REL-GH-PRIORITY-ASAP-LABEL');
    expect(releaseDoc).toContain('REL-GH-ASAP-ZERO');
    expect(releaseDoc).toContain('REL-GH-TARGET-MILESTONE-EXISTS');
    expect(releaseDoc).toContain('REL-GH-TARGET-MILESTONE-ZERO');
    expect(releaseDoc).toContain('REL-GH-PRIOR-RELEASE-MILESTONES');
    expect(releaseDoc).toContain('REL-GH-PRIOR-RELEASE-ZERO');
    expect(releaseGuard).toContain('require_label "REL-GH-PRIORITY-ASAP-LABEL" "priority:asap"');
    expect(releaseGuard).toContain('check_zero_label "REL-GH-ASAP-ZERO" "priority:asap"');
    expect(releaseGuard).toContain('require_milestone "REL-GH-TARGET-MILESTONE-EXISTS" "$TARGET_MILESTONE"');
    expect(releaseGuard).toContain('check_zero_milestone "REL-GH-TARGET-MILESTONE-ZERO" "$TARGET_MILESTONE"');
    expect(releaseGuard).toContain('REL-GH-PRIOR-RELEASE-MILESTONES');
    expect(releaseGuard).not.toContain('check_zero_label "REL-GH-ASAP-ZERO" "lane:asap"');
    expect(releaseGuard).not.toContain('REL-GH-TARGET-LANE-ZERO');
    expect(releaseGuard).not.toContain('release-home:v');
    expect(releaseGuard).toContain('git status --porcelain');
  });

  it('requires version lockstep across npm, jsr, lockfile, and private workspaces', () => {
    expect(releaseDoc).toContain('REL-META-VERSION-LOCKSTEP');
    expect(releaseDoc).toContain('private workspace package versions');
    expect(releaseGuard).toContain('package-lock.json root package');
    expect(releaseGuard).toContain('packages');
    expect(releaseGuard).toContain('must remain private unless publish policy changes');
  });

  it('requires release evidence and documentation review before tagging', () => {
    expect(existsSync(releaseEvidenceTemplatePath)).toBe(true);
    expect(releaseDoc).toContain('release-evidence-template.md');
    expect(releaseDoc).toContain('CHANGELOG.md` accurately reflects the diff');
    expect(releaseDoc).toContain('Any accepted residual risk is named with rationale, owner, and follow-up');
    expect(releaseDoc).toContain('Deterministic reproducibility');
    expect(releaseDoc).toContain('docs/releases/vX.Y.Z/fixtures/');
    expect(releaseGuard).toContain('REL-DOC-EVIDENCE');
    expect(releaseGuard).toContain('Deterministic reproducibility');
    expect(releaseGuard).toContain('Goalpost evidence');
    expect(releaseGuard).toContain('Canonical fixtures and witnesses');
    expect(releaseGuard).toContain('evidence packet still contains template placeholders');
    expect(releaseEvidenceTemplate).toContain('Deterministic reproducibility');
    expect(releaseEvidenceTemplate).toContain('Goalpost evidence');
    expect(releaseEvidenceTemplate).toContain('Canonical fixtures and witnesses');
    expect(releaseEvidenceTemplate).toContain('Expected deterministic result');

    for (const docPath of [
      'CHANGELOG.md',
      'README.md',
      'TECHNICAL_TEARDOWN.md',
      'docs/ARCHITECTURE.md',
      'docs/GETTING_STARTED.md',
      'docs/READINGS_AND_OPTICS.md',
      'docs/GUIDE.md',
      'docs/API_REFERENCE.md',
      'docs/PUBLIC_API_COSTS.md',
      'docs/CLI_GUIDE.md',
      'docs/ROADMAP.md',
      'docs/BEARING.md',
    ]) {
      expect(releaseEvidenceTemplate).toContain(docPath);
      expect(releaseGuard).toContain(docPath);
    }
  });

  it('runs release tests and documentation gates before publish jobs', () => {
    expect(preflight).toContain('npm run lint:md --silent');
    expect(preflight).toContain('npm run lint:md:code --silent');
    expect(preflight).toContain('npm run lint:links --silent');
    expect(preflight).toContain('fail "tsc produced errors"');
    expect(preflight).toContain('npm audit found high/critical runtime vulnerabilities');
    expect(preflight).not.toContain('Security audit (warning only)');

    expect(releaseWorkflow).toContain('Fetch main for release guard');
    expect(releaseWorkflow).toContain('Verify release tests and docs');
    expect(releaseWorkflow).toContain('npm run lint:md');
    expect(releaseWorkflow).toContain('npm run lint:links');
    expect(releaseWorkflow).toContain('npm run typecheck:surface');
    expect(releaseWorkflow).toContain('npm run test:coverage:ci');
  });

  it('locks reading identity, fixture, and goalpost guard doctrine into docs', () => {
    expect(existsSync(readingIdentitySpecPath)).toBe(true);
    expect(existsSync(canonicalFixturesDocPath)).toBe(true);
    expect(existsSync(goalpostGuardPath)).toBe(true);
    expect(packageJson.scripts['goalpost:guard']).toBe('bash scripts/goalpost-guard.sh');

    expect(architectureDoc).toContain('Graph-shaped readings');
    expect(architectureDoc).toContain('Reading Identity');
    expect(readingIdentitySpec).toContain('A byte hash identifies bytes.');
    expect(readingIdentitySpec).toContain('Semantic reading identity');
    expect(canonicalFixturesDoc).toContain('fixture + replay command -> witness');
    expect(canonicalFixturesDoc).toContain('Host-specific noise must be normalized');
    expect(goalpostGuard).toContain('Deterministic Evidence');
    expect(goalpostGuard).toContain('Slice budget');
    expect(roadmapPlanning).toContain(
      'status: "planned" | "scaffolded" | "active" | "review-ready" | "landed" | "superseded"',
    );
  });

  it('keeps the roadmap header honest about the public release and repair entry', () => {
    expect(roadmap).toContain('**Current public package/tag release:** v17.0.0');
    expect(roadmap).toContain('**Next intended release:** v18.0.0');
    expect(roadmap).toContain(
      'v17.0.1 repair work is recorded in source docs/changelog without public npm/tag evidence',
    );
  });

  it('sets up the active v18 roadmap planning instance', () => {
    expect(roadmap).toContain('## Active Planning Instance');
    expect(roadmap).toContain('| Release status | `pre-tag complete` |');
    expect(roadmap).toContain('| Goalposts | `5` |');
    expect(roadmap).toContain('| Landed goalposts | `5` |');
    expect(roadmap).toContain('| Total planned slice budget | `53` |');
    expect(roadmap).toContain('v18.0.0 goalposts: 5/5 landed');
    expect(roadmap).toContain('v18.0.0 slices: 53/53 landed');
    expect(roadmap).toContain('next slice: keep paying down v18-line debt without cutting the tag');
    expect(roadmap).toContain('No v18 tag has been cut');
    expect(roadmap).toContain('explicit operator approval');
    expect(roadmap).toContain('method/roadmap/v18.0.0/v18-gp4-holographic-slicing-checkpoint-basis.md');

    for (const goalpostPath of v18GoalpostPaths) {
      const goalpost = readFileSync(goalpostPath, 'utf8');
      expect(goalpost).toContain('Goalpost id');
      expect(goalpost).toContain('## Proof Stories');
      expect(goalpost).toContain('## Slice Budget');
      expect(goalpost).toContain('## Acceptance Criteria');
      expect(goalpost).toContain('## Deterministic Evidence');
      expect(goalpost).toContain('## Release Gate Impact');
    }
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
