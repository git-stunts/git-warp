import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(
  fileURLToPath(new URL('../../../README.md', import.meta.url)),
  'utf8',
);

describe('README front-door shape', () => {
  it('acts as an evaluator-facing filter instead of a tutorial or reference', () => {
    expect(readme).toContain('## What git-warp is');
    expect(readme).toContain('## Why Git');
    expect(readme).toContain('## The admission architecture');
    expect(readme).toContain('## Documentation');

    expect(readme).not.toContain('npm install @git-stunts/git-warp');
    expect(readme).not.toContain('WarpApp.open(');
    expect(readme).not.toContain('app.patch(');
    expect(readme).not.toContain('worldline.query()');
  });

  it('qualifies the user quickly with the fit table and use guidance', () => {
    expect(readme).toContain('| Use case | Fit |');
    expect(readme).toContain('| Offline-first multi-writer convergence |');
    expect(readme).toContain('| High-throughput real-time execution |');
    expect(readme).toContain('## When to use it');
  });

  it('explains the Git substrate and stack map without marketing language', () => {
    expect(readme).toContain('refs/warp/<graph>/writers/<writerId>');
    expect(readme).toContain("Git's empty tree");
    expect(readme).not.toContain('TL;DR for humans');
    expect(readme).not.toContain('WarpRuntime');
  });

  it('hands off to the progressive disclosure pipeline explicitly', () => {
    expect(readme).toContain('[Getting Started](docs/GETTING_STARTED.md)');
    expect(readme).toContain('[Guide](docs/GUIDE.md)');
    expect(readme).toContain('[API Reference](docs/API_REFERENCE.md)');
    expect(readme).toContain('[CLI Guide](docs/CLI_GUIDE.md)');
  });
});
