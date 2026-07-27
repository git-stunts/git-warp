import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';

import { run } from '@mermaid-js/mermaid-cli';

const ROOT = resolve('.');
const SKIPPED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const OPENING_FENCE = /^```mermaid[ \t]*$/u;
const CLOSING_FENCE = /^```[ \t]*$/u;

type MermaidBlock = Readonly<{
  line: number;
  source: string;
}>;

async function main(): Promise<void> {
  const markdownFiles = await listMarkdownFiles(ROOT);
  let diagramCount = 0;
  let fileCount = 0;
  const renderInput: string[] = [];
  for (const path of markdownFiles) {
    const blocks = extractMermaidBlocks(await readFile(path, 'utf8'), path);
    if (blocks.length > 0) {
      fileCount += 1;
    }
    for (const block of blocks) {
      diagramCount += 1;
      renderInput.push(
        `<!-- ${relative(ROOT, path)}:${String(block.line)} -->`,
        '```mermaid',
        block.source,
        '```',
        ''
      );
    }
  }
  if (diagramCount === 0) {
    throw new Error('Mermaid validation found no diagrams');
  }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'git-warp-mermaid-validation-'));
  try {
    const inputPath = join(temporaryDirectory, 'diagrams.md');
    const outputPath = join(temporaryDirectory, 'rendered.md') as `${string}.md`;
    await writeFile(inputPath, renderInput.join('\n'), 'utf8');
    try {
      await run(inputPath, outputPath, {
        artefacts: temporaryDirectory,
        puppeteerConfig: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        quiet: true,
      });
    } catch (error: unknown) {
      throw new Error(`Mermaid render failed: ${formatFailure(error)}`, {
        cause: error,
      });
    }
    process.stdout.write(
      `Mermaid render valid: ${String(diagramCount)} diagrams in ${String(fileCount)} files.\n`
    );
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

function extractMermaidBlocks(markdown: string, path: string): MermaidBlock[] {
  const lines = markdown.split('\n');
  const blocks: MermaidBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!OPENING_FENCE.test(lines[index] ?? '')) {
      continue;
    }
    const start = index + 2;
    const source: string[] = [];
    index += 1;
    while (index < lines.length && !CLOSING_FENCE.test(lines[index] ?? '')) {
      source.push(lines[index] ?? '');
      index += 1;
    }
    if (index >= lines.length) {
      throw new Error(`${relative(ROOT, path)}:${String(start - 1)}: unclosed Mermaid fence`);
    }
    blocks.push(Object.freeze({ line: start, source: source.join('\n') }));
  }
  return blocks;
}

async function listMarkdownFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        paths.push(...(await listMarkdownFiles(path)));
      }
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      paths.push(path);
    }
  }
  return Object.freeze(paths.sort());
}

function formatFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replaceAll('\n', ' ');
  }
  return String(error);
}

await main();
