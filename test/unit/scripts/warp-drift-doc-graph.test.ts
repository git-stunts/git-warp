import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type MarkdownLink = {
  readonly label: string;
  readonly href: string;
};

type SlottingRow = {
  readonly driftArea: string;
  readonly releaseHome: string;
};

function readDoc(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function markdownLinks(markdown: string): readonly MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/gu;
  for (const match of markdown.matchAll(pattern)) {
    const label = match[1];
    const href = match[2];
    if (label !== undefined && href !== undefined && !href.startsWith('http')) {
      links.push({ label, href });
    }
  }
  return links;
}

function resolveDocLink(sourcePath: string, href: string): string {
  return normalize(join(dirname(sourcePath), href));
}

function linkTargets(sourcePath: string): Set<string> {
  return new Set(
    markdownLinks(readDoc(sourcePath)).map((link) => resolveDocLink(sourcePath, link.href)),
  );
}

function parseSlottingRows(markdown: string): readonly SlottingRow[] {
  const rows: SlottingRow[] = [];
  let inMatrix = false;

  for (const line of markdown.split('\n')) {
    if (line.trim() === '## Slotting matrix') {
      inMatrix = true;
      continue;
    }
    if (inMatrix && line.startsWith('## ')) {
      break;
    }
    if (!inMatrix || !line.startsWith('|')) {
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 3 || cells[0] === 'Drift area' || cells[0]?.startsWith('---')) {
      continue;
    }
    const driftArea = cells[0];
    const releaseHome = cells[1];
    if (driftArea !== undefined && releaseHome !== undefined) {
      rows.push({ driftArea, releaseHome: releaseHome.replaceAll('`', '') });
    }
  }

  return rows;
}

describe('WARP drift documentation graph', () => {
  it('resolves the drift ledger links to canonical noun, ladder, slotting, and horizon docs', () => {
    const sourcePath = 'docs/audits/WARP_DRIFT.md';
    const targets = linkTargets(sourcePath);
    const requiredTargets = [
      'docs/GLOSSARY.md',
      'docs/design/0035-observer-geometry-architecture-ladder.md',
      'docs/design/0037-remaining-warp-drift-release-slotting.md',
      'docs/design/release-horizon-v20-v21.md',
    ] as const;

    for (const target of requiredTargets) {
      expect(targets.has(target), target).toBe(true);
      expect(existsSync(join(REPO_ROOT, target)), target).toBe(true);
    }
  });

  it('keeps release slotting as structured v19, v20, and v21 rows', () => {
    const rows = parseSlottingRows(readDoc('docs/design/0037-remaining-warp-drift-release-slotting.md'));

    expect(rows).toEqual([
      { driftArea: 'Observer surface still snapshot/materialize/filter', releaseHome: 'v19' },
      { driftArea: 'Public noun split only partially realized in code', releaseHome: 'v19' },
      { driftArea: 'Slice-first runtime realization and fragment reuse', releaseHome: 'v20' },
      { driftArea: 'Strand semantics centered on frozen pinned base', releaseHome: 'v20 to v21' },
      { driftArea: 'Braiding as pinned-base equality', releaseHome: 'v21' },
      { driftArea: 'Sync as frontier + patches rather than witnessed admission', releaseHome: 'v19 to v21' },
    ]);
  });

  it('connects the horizon and v19 lane back to the slotting doc as data links', () => {
    const horizonTargets = linkTargets('docs/design/release-horizon-v20-v21.md');
    const v19Targets = linkTargets(
      'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v19.0.0/README.md',
    );

    expect(horizonTargets.has('docs/design/0037-remaining-warp-drift-release-slotting.md')).toBe(true);
    expect(v19Targets.has(
      'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v20.0.0/PROTO_playback-head-alignment.md',
    )).toBe(true);
    expect(v19Targets.has(
      'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v21.0.0/PROTO_local-site-object-for-neighborhoods.md',
    )).toBe(true);
  });
});
