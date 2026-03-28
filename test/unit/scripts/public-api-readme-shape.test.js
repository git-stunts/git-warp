import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(
  fileURLToPath(new URL('../../../README.md', import.meta.url)),
  'utf8',
);

describe('README front-door shape', () => {
  it('acts as an evaluator-facing filter instead of a tutorial or reference', () => {
    expect(readme).toContain('## Choose the right tool');
    expect(readme).toContain('## What git-warp is');
    expect(readme).toContain('## Why Git');
    expect(readme).toContain('## Architecture at a glance');
    expect(readme).toContain('## Documentation pipeline');

    expect(readme).not.toContain('## Quick start');
    expect(readme).not.toContain('npm install @git-stunts/git-warp');
    expect(readme).not.toContain('WarpApp.open(');
    expect(readme).not.toContain('app.patch(');
    expect(readme).not.toContain('worldline.query()');
  });

  it('qualifies the user quickly with the fit table and use guidance', () => {
    expect(readme).toContain('| Use case | git-warp | Echo | Other | Remarks |');
    expect(readme).toContain('| Offline-first collaborative app |');
    expect(readme).toContain('| High-performance realtime simulation or game loop |');
    expect(readme).toContain('## When to use it');
    expect(readme).toContain('## When not to use it');
  });

  it('explains the Git substrate and stack map without marketing language', () => {
    expect(readme).toContain('refs/warp/<graph>/writers/<writerId>');
    expect(readme).toContain("Git's well-known empty tree");
    expect(readme).toContain('Distributed, conflict-free graph storage that lives orthogonally to your source tree.');
    expect(readme).not.toContain('TL;DR for humans');
    expect(readme).not.toContain('WarpRuntime');
  });

  it('hands off to the progressive disclosure pipeline explicitly', () => {
    expect(readme).toContain('[Getting Started](docs/GETTING_STARTED.md)');
    expect(readme).toContain('[Guide](docs/GUIDE.md)');
    expect(readme).toContain('[API Reference](docs/API_REFERENCE.md)');
    expect(readme).toContain('[Advanced Guide](docs/ADVANCED_GUIDE.md)');
    expect(readme).toContain('[CLI Guide](docs/CLI_GUIDE.md)');
    expect(readme).toContain('**[Documentation index](docs/README.md)**');
  });
});
