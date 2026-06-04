import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  InMemoryGraphAdapter,
  openWarpGraph,
  openWarpWorldline,
  WarpApp,
  WarpCore,
} from '../../../index.ts';

const architecture = readFileSync(
  fileURLToPath(new URL('../../../docs/ARCHITECTURE.md', import.meta.url)),
  'utf8',
);

type Heading = {
  readonly level: number;
  readonly text: string;
};

type CodeBlock = {
  readonly language: string;
  readonly lines: readonly string[];
};

function markdownHeadings(markdown: string): readonly Heading[] {
  return markdown
    .split('\n')
    .flatMap((line) => {
      const match = /^(#{1,6}) (.+)$/u.exec(line);
      if (match === null) {
        return [];
      }
      const marker = match[1];
      const text = match[2];
      if (marker === undefined || text === undefined) {
        return [];
      }
      return [{
        level: marker.length,
        text,
      }];
    });
}

function headingIndex(headings: readonly Heading[], text: string): number {
  const index = headings.findIndex((heading) => heading.text === text);
  expect(index, `Missing heading ${text}`).toBeGreaterThanOrEqual(0);
  return index;
}

function fencedCodeBlocks(markdown: string): readonly CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let language: string | null = null;
  let lines: string[] = [];

  for (const line of markdown.split('\n')) {
    if (language === null) {
      const openingFence = /^```(\S*)$/u.exec(line);
      if (openingFence !== null) {
        language = openingFence[1] ?? '';
        lines = [];
      }
      continue;
    }

    if (line === '```') {
      blocks.push({ language, lines });
      language = null;
      lines = [];
      continue;
    }

    lines.push(line);
  }

  return blocks;
}

function publicApiCodeBlock(firstLine: string): CodeBlock {
  const block = fencedCodeBlocks(architecture)
    .find((candidate) => candidate.language === 'text'
      && candidate.lines[0] === firstLine);
  if (block === undefined) {
    throw new Error(`Missing architecture code block beginning with ${firstLine}`);
  }
  return block;
}

describe('architecture doc shape', () => {
  it('documents public surfaces in first-use to compatibility order', () => {
    const headings = markdownHeadings(architecture);
    expect(headings[0]).toEqual({ level: 1, text: 'git-warp architecture' });

    expect(headings.filter((heading) => heading.level === 2).map((heading) => heading.text))
      .toEqual([
        'System map',
        'Architectural principles',
        'Public API surface',
        'Internal engine',
        'Git storage model',
      ]);

    const worldlineIndex = headingIndex(headings, '`openWarpWorldline()` (v18+)');
    const graphIndex = headingIndex(headings, '`openWarpGraph()` (compatibility and diagnostics)');
    const legacyIndex = headingIndex(headings, '`WarpApp` / `WarpCore` (legacy, v16 compat)');

    expect(worldlineIndex).toBeLessThan(graphIndex);
    expect(graphIndex).toBeLessThan(legacyIndex);
  });

  it('keeps documented public API blocks aligned with exported runtime handles', async () => {
    const worldlineBlock = publicApiCodeBlock(
      'const team = await openWarpWorldline({ persistence, worldlineName, writerId });',
    );
    expect(worldlineBlock.lines.slice(2)).toEqual([
      'team.commit(...)       // commitment: write one atomic patch',
      'team.live()            // revelation: current admitted worldline',
      'team.seek(...)         // revelation: pinned coordinate read',
      'team.observer(...)     // revelation: bounded aperture',
      'team.optic()           // revelation: bounded optic question',
    ]);

    const graphBlock = publicApiCodeBlock(
      'const graph = await openWarpGraph({ persistence, graphName, writerId });',
    );
    expect(graphBlock.lines.slice(2)).toEqual([
      'graph.query.*          // revelation: read state',
      'graph.patches.*        // commitment: write patches',
      'graph.sync.*           // governance: distributed sync',
      'graph.strands.*        // commitment: speculative lanes',
      'graph.checkpoint.*     // folding: history folding',
      'graph.provenance.*     // revelation: witness access',
      'graph.comparison.*     // commitment: braid comparison',
      'graph.subscriptions.*  // revelation: reactive state',
    ]);

    expect(graphBlock.lines.some((line) => line.startsWith('graph.materialize.'))).toBe(false);

    const worldline = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'architecture-doc-worldline',
      writerId: 'writer-a',
    });
    expect(Object.isFrozen(worldline)).toBe(true);
    expect(typeof worldline.commit).toBe('function');
    expect(typeof worldline.live).toBe('function');
    expect(typeof worldline.seek).toBe('function');
    expect(typeof worldline.observer).toBe('function');
    expect(typeof worldline.optic).toBe('function');

    const graph = await openWarpGraph({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'architecture-doc-graph',
      writerId: 'writer-b',
    });
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.keys(graph).sort()).toEqual([
      'checkpoint',
      'commitment',
      'comparison',
      'folding',
      'governance',
      'graphName',
      'patches',
      'provenance',
      'query',
      'revelation',
      'strands',
      'subscriptions',
      'sync',
      'writerId',
    ]);
    expect(typeof graph.query).toBe('object');
    expect(typeof graph.patches).toBe('object');
    expect(typeof graph.sync).toBe('object');
    expect(typeof graph.strands).toBe('object');
    expect(typeof graph.checkpoint).toBe('object');
    expect(typeof graph.provenance).toBe('object');
    expect(typeof graph.comparison).toBe('object');
    expect(typeof graph.subscriptions).toBe('object');
    expect('materialize' in graph).toBe(false);

    expect(typeof WarpApp.open).toBe('function');
    expect(typeof WarpCore.open).toBe('function');
  });
});
