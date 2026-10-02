import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const validator = fileURLToPath(new URL('../../../scripts/validate-mermaid.ts', import.meta.url));
const probe = fileURLToPath(new URL('../../fixtures/mermaid-browser-probe.mjs', import.meta.url));

it('fails a real render with stalled browser close within its cleanup deadline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mermaid-shutdown-test-'));
  const marker = join(directory, 'browser-probe');
  await writeFile(join(directory, 'input.md'), '```mermaid\ngraph TD\nA --> B\n```\n');
  const child = spawn(process.execPath, ['--import', probe, validator], {
    cwd: directory, detached: true,
    env: { ...process.env, TMPDIR: directory, MERMAID_BROWSER_PROBE: marker, MERMAID_BROWSER_PROBE_MODE: 'close-stall' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  try {
    const result = await new Promise<number | null>((resolve) => {
      const timeout = setTimeout(() => { resolve(null); }, 15000);
      child.once('close', code => { clearTimeout(timeout); resolve(code); });
    });
    const [pid, diagrams] = (await readFile(marker, 'utf8')).split('\n').map(Number);
    expect(diagrams).toBe(1); // Real rendering completed; files alone cannot pass.
    expect(result, 'validator must exit after its browser-shutdown deadline').not.toBeNull();
    expect(result).not.toBe(0);
    expect(output).toContain('Mermaid browser shutdown timed out');
    expect(output).not.toContain('Mermaid render valid:');
    expect(() => process.kill(pid ?? 0, 0)).toThrow();
  } finally {
    const pid = Number((await readFile(marker, 'utf8').catch(() => '')).split('\n')[0]);
    for (const owned of [pid, child.pid]) {
      if (owned !== undefined && owned > 0) {
        try { process.kill(-owned, 'SIGKILL'); } catch { /* Already reclaimed. */ }
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
