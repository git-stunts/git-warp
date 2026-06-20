import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const SOURCE_ROOT = 'src';

function sourceFiles(relativePath = SOURCE_ROOT): string[] {
  const absolutePath = join(repoRoot, relativePath);
  const files: string[] = [];
  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    const entryPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function text(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('WarpServe boundary ratchet', () => {
  it('keeps the retired WarpServeService out of active source', () => {
    for (const relativePath of sourceFiles()) {
      expect(relativePath, 'WarpServeService must not return as an active source path')
        .not.toContain('WarpServeService');
      expect(text(relativePath), `${relativePath} must not define or import WarpServeService`)
        .not.toContain('WarpServeService');
    }
  });

  it('keeps WebSocket server ports out of the domain boundary', () => {
    for (const relativePath of sourceFiles('src/domain')) {
      expect(text(relativePath), `${relativePath} must not depend on WebSocket server ports`)
        .not.toContain('WebSocketServerPort');
    }
    for (const relativePath of sourceFiles('src/ports')) {
      expect(relativePath, 'WebSocketServerPort must not return as an active source port')
        .not.toContain('WebSocketServerPort');
    }
  });
});
