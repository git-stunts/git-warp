import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import katex, { type KatexOptions } from 'katex';
import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';
import MermaidRenderSupervisor from '../../../scripts/mermaid/MermaidRenderSupervisor.ts';

const CHILD_TIMEOUT_MS = 5_000;
const MAX_CHILD_OUTPUT_BYTES = 1024;
const MARKDOWNLINT = fileURLToPath(new URL('../../../node_modules/markdownlint-cli/markdownlint.js', import.meta.url));
const REFUSED_SOURCE_MAP_PROCESS = fileURLToPath(new URL('../../fixtures/RejectedSourceMapOffsetProcess.mjs', import.meta.url));
const SOURCE_MAP_PROCESS = fileURLToPath(new URL('../../fixtures/IndexedSourceMapOffsetProcess.mjs', import.meta.url));

// Real installed callers are the oracle; audit version metadata alone is insufficient.
describe('patched locked tooling compatibility', () => {
  it('renders ordinary mathematical expressions through the supported KaTeX API', () => {
    const html = katex.renderToString('x^2 + \\frac{1}{2}', { output: 'html', throwOnError: true });
    expect(html).toContain('class="katex"');
    expect(html).toContain('mfrac');
  });

  it('preserves explicit trusted link rendering', () => {
    const html = katex.renderToString('\\href{https://example.invalid}{x}', { trust: true });
    expect(html).toContain('<a ');
    expect(html).toContain('href="https://example.invalid"');
  });

  it('does not turn an inherited trust setting into an explicit permission', () => {
    const options: KatexOptions = { strict: 'ignore' };
    Object.setPrototypeOf(options, { trust: true });
    const html = katex.renderToString('\\href{https://example.invalid}{x}', options);
    expect(html).not.toContain('<a ');
  });

  it('preserves supported nested TOML values', () => {
    expect(parse('title = "audit"\n[validation]\nenabled = true\nformats = ["math", "docs"]\n')).toEqual({
      title: 'audit', validation: { enabled: true, formats: ['math', 'docs'] },
    });
  });

  it('uses TOML configuration through the actual Markdownlint CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'locked-markdownlint-'));
    try {
      const config = join(directory, '.markdownlint.toml');
      const document = join(directory, 'document.md');
      writeFileSync(config, 'default = false\nMD040 = true\nMD013 = false\n');
      writeFileSync(document, '```text\nvalid\n```\n');
      execFileSync(process.execPath, [MARKDOWNLINT, '--config', config, document], { timeout: CHILD_TIMEOUT_MS, stdio: 'pipe' });
      writeFileSync(document, '```\nmissing language\n```\n');
      expect(() => execFileSync(process.execPath, [MARKDOWNLINT, '--config', config, document], {
        timeout: CHILD_TIMEOUT_MS, stdio: 'pipe',
      })).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('renders mathematical labels through the actual Mermaid browser worker', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'locked-mermaid-math-'));
    try {
      const input = join(directory, 'input.md');
      const output = join(directory, 'rendered.md');
      writeFileSync(input, '```mermaid\nflowchart TD\nA["$$x^2 + \\frac{1}{2}$$"]\n```\n');
      await new MermaidRenderSupervisor().render(input, output);
      const images = readdirSync(directory).filter(path => path.endsWith('.svg'));
      expect(images).toHaveLength(1);
      const image = images[0];
      if (image === undefined) { throw new Error('Mermaid omitted the mathematical SVG'); }
      expect(readFileSync(join(directory, image), 'utf8')).toContain('class="katex"');
      expect(readFileSync(output, 'utf8')).toContain(image);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('refuses an oversized indexed source-map section before consuming code', () => {
    const result = execFileSync(process.execPath, [REFUSED_SOURCE_MAP_PROCESS], {
      timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: MAX_CHILD_OUTPUT_BYTES,
    });
    expect(result).toBe('refused\n');
  });

  it('preserves generated code when an accepted mapping points beyond its end', () => {
    // Source-map-js formerly looped up to this offset. Kill the isolated process on deadline.
    const result = execFileSync(process.execPath, [SOURCE_MAP_PROCESS], {
      timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: MAX_CHILD_OUTPUT_BYTES,
    });
    expect(result).toBe('value\n');
  });
});
