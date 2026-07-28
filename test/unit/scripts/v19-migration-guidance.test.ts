import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MIGRATION_GUIDE = readFileSync(join(ROOT, 'docs/migrations/v19/README.md'), 'utf8');
const ROOT_README = readFileSync(join(ROOT, 'README.md'), 'utf8');

function generatedSdkSection(): string {
  const start = MIGRATION_GUIDE.indexOf('## Generated Domain SDKs');
  const end = MIGRATION_GUIDE.indexOf('\n## Write Migration', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return MIGRATION_GUIDE.slice(start, end);
}

describe('v19 migration guidance', () => {
  it('keeps the root README on the safe one-pass v19.0.1 migration', () => {
    expect(ROOT_README).toContain('@git-stunts/git-warp@19.0.1');
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

  it('gives an adopter a complete generated-user workflow', () => {
    const section = generatedSdkSection();

    expect(section).toMatch(/not a\s+human account/u);
    expect(section).toContain('application-owned renderer');
    expect(section).toContain('Node.js 22.18 or newer');
    expect(section).toContain('cargo install wesley-cli --version 0.3.0-alpha.1 --locked');
    expect(section).toContain(
      '"generate:users:wesley": "wesley emit typescript --schema src/warp/users.graphql --out src/generated/users.wesley.generated.ts"',
    );
    expect(section).toContain(
      '"generate:users:sdk": "node scripts/RenderUsersSdk.ts --out src/generated/users.generated.ts"',
    );
    expect(section).toContain(
      '"check:users": "npm run generate:users && git diff --exit-code -- src/generated"',
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
