import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const API_GUIDE = readFileSync(join(ROOT, 'docs/topics/api/README.md'), 'utf8');
const ARCHITECTURE = readFileSync(join(ROOT, 'ARCHITECTURE.md'), 'utf8');
const MIGRATION_GUIDE = readFileSync(join(ROOT, 'docs/migrations/v19/README.md'), 'utf8');
const OPERATIONS_GUIDE = readFileSync(join(ROOT, 'docs/operations/README.md'), 'utf8');
const ROOT_README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const TOPICS_INDEX = readFileSync(join(ROOT, 'docs/topics/README.md'), 'utf8');
const SAFE_MIGRATION_COMMAND =
  /npm exec --package=@git-stunts\/git-warp@19\.1\.0 -- \\\r?\n(?:> )?[ \t]+git-warp-v18-to-v19/u;

function generatedSdkSection(): string {
  const start = MIGRATION_GUIDE.indexOf('## Generated Domain SDKs');
  const end = MIGRATION_GUIDE.indexOf('\n## Write Migration', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return MIGRATION_GUIDE.slice(start, end);
}

describe('v19 migration guidance', () => {
  it('keeps every public release signpost on v19.1.0', () => {
    expect(ROOT_README).toContain('`v19.1.0` is the current release');
    expect(ARCHITECTURE).toContain('`v19.1.0` is the current release');
    expect(TOPICS_INDEX).toContain('`v19.1.0` is the current release');
    expect(API_GUIDE).toContain('Current in `v19.1.0`');
  });

  it('keeps the root README on the current safe one-pass migration', () => {
    expect(ROOT_README).toMatch(SAFE_MIGRATION_COMMAND);
    expect(ROOT_README).toContain('--repo /path/to/repository');
    expect(ROOT_README).toContain('--graph <graph-name>');
    expect(ROOT_README).toContain('--dry-run');
    expect(ROOT_README).toContain('E_SUBSTRATE_MIGRATION_REQUIRED');
    expect(ROOT_README).toContain('recovery refs');
    expect(ROOT_README).toContain('asks for confirmation');
    expect(ROOT_README).not.toContain('@git-stunts/git-warp@19.0.0 -- git-warp-v18-to-v19');
    expect(ROOT_README.match(/git-warp-v18-to-v19/gu)).toHaveLength(1);
    expect(ROOT_README).not.toContain('--apply');
    expect(ROOT_README).not.toMatch(/two-pass/iu);
    expect(ROOT_README).toContain('one pass');
  });

  it('states the Git mutation boundary and executable recovery posture precisely', () => {
    expect(MIGRATION_GUIDE).toContain('git clone --mirror --no-hardlinks');
    expect(MIGRATION_GUIDE).toContain('Authoritative WARP refs remain unchanged');
    expect(MIGRATION_GUIDE).toContain('refs/warp-migration-import/v18-to-v19/');
    expect(MIGRATION_GUIDE).toContain('private import refs are deleted');
    expect(MIGRATION_GUIDE).not.toContain(
      'The source repository is read-only until the final ref transaction'
    );
  });

  it('gives operators one complete maintenance-window checklist', () => {
    expect(OPERATIONS_GUIDE).toContain('## Migrate retained v18 state');
    expect(OPERATIONS_GUIDE).toMatch(SAFE_MIGRATION_COMMAND);
    expect(OPERATIONS_GUIDE).toContain('git clone --mirror --no-hardlinks');
    expect(OPERATIONS_GUIDE).toContain('already-current');
    expect(OPERATIONS_GUIDE).toContain('Keep the recovery refs');
  });

  it('does not describe implemented settlement as future work', () => {
    expect(MIGRATION_GUIDE).toContain('`Runtime.previewSettlement()`');
    expect(MIGRATION_GUIDE).toContain('`Runtime.settle()`');
    expect(MIGRATION_GUIDE).not.toContain(
      'This settlement surface is still open implementation work'
    );
  });

  it('gives an adopter a complete generated-user workflow', () => {
    const section = generatedSdkSection();

    expect(section).toMatch(/not a\s+human account/u);
    expect(section).toContain('application-owned renderer');
    expect(section).toContain('Node.js 22.18 or newer');
    expect(section).toContain('cargo install wesley-cli --version 0.3.0-alpha.1 --locked');
    expect(section).toContain(
      '"generate:users:wesley": "wesley emit typescript --schema src/warp/users.graphql --out src/generated/users.wesley.generated.ts"'
    );
    expect(section).toContain(
      '"generate:users:sdk": "node scripts/RenderUsersSdk.ts --out src/generated/users.generated.ts"'
    );
    expect(section).toContain(
      '"check:users": "npm run generate:users && git diff --exit-code -- src/generated"'
    );
    expect(section).toContain('users.graphql');
    expect(section).toContain('users.wesley.generated.ts');
    expect(section).toContain('users.generated.ts');
    expect(section).toContain("import { users } from './generated/users.generated.js';");
    expect(section).toContain('const runtime = await Runtime.open({');
    expect(section).toContain('await lane.write(');
    expect(section).toContain('const observation = lane.observe(');
    expect(section).toContain('await runtime.close();');
    expect(section).toMatch(/does not open or\s+mutate/u);
  });

  it('anchors the small example to executable fixture evidence', () => {
    const section = generatedSdkSection();
    const fixturePaths = [
      'test/fixtures/generated-sdk/users.graphql',
      'test/fixtures/generated-sdk/users.wesley.generated.ts',
      'test/fixtures/generated-sdk/users.generated.ts',
      'test/fixtures/generated-sdk/consumer-write.ts',
      'test/fixtures/generated-sdk/consumer-read.ts',
      'scripts/smoke-generated-sdk.sh',
    ];

    for (const fixturePath of fixturePaths) {
      expect(statSync(join(ROOT, fixturePath)).size, fixturePath).toBeGreaterThan(0);
      expect(section).toContain(fixturePath);
    }
  });
});
