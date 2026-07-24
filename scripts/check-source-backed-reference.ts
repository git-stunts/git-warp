import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { directExportName } from './direct-export-name.ts';
const OUTPUT_PATH = 'docs/topics/reference.md';
class SourceText {
  readonly path: string;
  readonly lines: readonly string[];

  constructor(path: string) { this.path = path; this.lines = readFileSync(path, 'utf8').split('\n'); }
  line(index: number): string { return this.lines[index] ?? ''; }
  ref(index: number): string { return `${this.path}#L${index + 1}`; }
}

type InventoryItem = { readonly name: string; readonly detail: string; readonly source: string };
function inventoryItem(name: string, detail: string, source: string): InventoryItem { return Object.freeze({ name, detail, source }); }

function captureObjectEntries(source: SourceText, field: string): readonly InventoryItem[] {
  const items: InventoryItem[] = [];
  let inside = false;
  let depth = 0;

  for (let index = 0; index < source.lines.length; index += 1) {
    const line = source.line(index);
    if (!inside && line.includes(`"${field}": {`)) {
      inside = true;
      depth = 1;
      continue;
    }

    if (!inside) {
      continue;
    }

    depth += (line.match(/{/g) ?? []).length;
    depth -= (line.match(/}/g) ?? []).length;
    if (depth <= 0) {
      break;
    }

    const match = /^\s+"([^"]+)":\s+"([^"]+)"/.exec(line);
    if (match) {
      items.push(inventoryItem(match[1] ?? '', match[2] ?? '', source.ref(index)));
    }
  }

  return items;
}

function captureExportEntries(source: SourceText, field: string): readonly InventoryItem[] {
  const items: InventoryItem[] = [];
  let inside = false;
  let depth = 0;

  for (let index = 0; index < source.lines.length; index += 1) {
    const line = source.line(index);
    if (!inside && line.includes(`"${field}": {`)) {
      inside = true;
      depth = 1;
      continue;
    }

    if (!inside) {
      continue;
    }

    if (depth === 1) {
      const stringMatch = /^\s+"([^"]+)":\s+"([^"]+)"/.exec(line);
      if (stringMatch) {
        items.push(inventoryItem(stringMatch[1] ?? '', stringMatch[2] ?? '', source.ref(index)));
      }

      const objectMatch = /^\s+"([^"]+)":\s+\{$/.exec(line);
      if (objectMatch) {
        const details: string[] = [];
        let nestedDepth = 1;
        let nestedIndex = index + 1;
        while (nestedIndex < source.lines.length && nestedDepth > 0) {
          const nestedLine = source.line(nestedIndex);
          const nestedMatch = /^\s+"([^"]+)":\s+"([^"]+)"/.exec(nestedLine);
          if (nestedMatch) {
            details.push(`${nestedMatch[1] ?? ''}=${nestedMatch[2] ?? ''}`);
          }
          nestedDepth += (nestedLine.match(/{/g) ?? []).length;
          nestedDepth -= (nestedLine.match(/}/g) ?? []).length;
          nestedIndex += 1;
        }
        items.push(inventoryItem(objectMatch[1] ?? '', details.join('; '), source.ref(index)));
        index = nestedIndex - 1;
        continue;
      }
    }

    depth += (line.match(/{/g) ?? []).length;
    depth -= (line.match(/}/g) ?? []).length;
    if (depth <= 0) {
      break;
    }
  }

  return items;
}

function cleanExportToken(token: string): string {
  return token
    .replace(/\/\/.*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function exportName(token: string): string {
  const cleaned = cleanExportToken(token);
  const alias = /\bas\s+([A-Za-z0-9_]+)/.exec(cleaned);
  if (alias) {
    return alias[1] ?? '';
  }
  return cleaned.replace(/^type\s+/, '').trim();
}

function collectLineNames(line: string): readonly string[] {
  return line
    .replace(/^\s*export\s+(type\s+)?\{/, '')
    .replace(/\}.*$/, '')
    .split(',')
    .map(exportName)
    .filter((name) => /^[A-Za-z0-9_]+$/.test(name))
    .sort((left, right) => left.localeCompare(right));
}

function captureExports(indexSource: SourceText, kind: 'values' | 'types'): readonly InventoryItem[] {
  const items: InventoryItem[] = [];
  const prefix = kind === 'types' ? 'export type {' : 'export {';

  for (let index = 0; index < indexSource.lines.length; index += 1) {
    const line = indexSource.line(index);
    const directName = directExportName(line, kind);
    if (directName !== null) { items.push(inventoryItem(directName, kind, indexSource.ref(index))); continue; }
    if (!line.trimStart().startsWith(prefix)) {
      continue;
    }

    let exportIndex = index;
    while (exportIndex < indexSource.lines.length) {
      const exportLine = indexSource.line(exportIndex);
      for (const name of collectLineNames(exportLine)) {
        items.push(inventoryItem(name, kind, indexSource.ref(exportIndex)));
      }
      if (exportLine.includes('};') || exportLine.includes("} from ")) {
        break;
      }
      exportIndex += 1;
    }

    index = exportIndex;
  }

  return items.sort((left, right) => left.name.localeCompare(right.name));
}

function captureReExportModules(indexSource: SourceText): readonly InventoryItem[] {
  const items: InventoryItem[] = [];
  for (let index = 0; index < indexSource.lines.length; index += 1) {
    const match = /^export \* from '([^']+)';$/.exec(indexSource.line(index));
    if (match) {
      items.push(inventoryItem(match[1] ?? '', 'export *', indexSource.ref(index)));
    }
  }
  return items;
}

function captureCommands(registrySource: SourceText): readonly InventoryItem[] {
  const items: InventoryItem[] = [];
  for (let index = 0; index < registrySource.lines.length; index += 1) {
    const match = /^\s+\['([^']+)',\s*([A-Za-z0-9_]+)\],$/.exec(registrySource.line(index));
    if (match) {
      items.push(inventoryItem(match[1] ?? '', match[2] ?? '', registrySource.ref(index)));
    }
  }
  return items;
}

function captureErrorClasses(errorSource: SourceText): readonly InventoryItem[] {
  const items: InventoryItem[] = [];
  for (let index = 0; index < errorSource.lines.length; index += 1) {
    const match = /^export \{ default as ([A-Za-z0-9_]+) \} from '([^']+)';$/.exec(errorSource.line(index));
    if (match && match[1]?.endsWith('Error') === true) {
      items.push(inventoryItem(match[1] ?? '', match[2] ?? '', errorSource.ref(index)));
    }
  }
  return items;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function codeList(items: readonly InventoryItem[]): string {
  return ['```text', ...items.map((item) => `${item.name} @ ${item.source}`), '```'].join('\n');
}

function requireLineRef(source: SourceText, needle: string): string {
  for (let index = 0; index < source.lines.length; index += 1) {
    if (source.line(index).includes(needle)) { return source.ref(index); }
  }
  throw new Error(`${needle} not found in ${source.path}`);
}

function exportSurface(title: string, source: SourceText, contract: string): readonly string[] {
  const modules = captureReExportModules(source);
  const valueExports = captureExports(source, 'values');
  const typeExports = captureExports(source, 'types');
  return [
    `## ${title}`,
    '',
    contract,
    '',
    ...(modules.length === 0 ? [] : ['### Export modules', '', table(['Module', 'Kind', 'Source'], modules.map((item) => [`\`${item.name}\``, item.detail, `\`${item.source}\``])), '']),
    '### Value exports',
    '',
    `Source: \`${source.path}\`. Count: ${valueExports.length}.`,
    '',
    codeList(valueExports),
    '',
    '### Type exports',
    '',
    `Source: \`${source.path}\`. Count: ${typeExports.length}.`,
    '',
    codeList(typeExports),
  ];
}

function generate(): string {
  const packageSource = new SourceText('package.json');
  const jsrSource = new SourceText('jsr.json');
  const registrySource = new SourceText('bin/cli/commands/registry.ts');
  const cliSource = new SourceText('bin/warp-graph.ts');
  const rootSource = new SourceText('index.ts');
  const storageSource = new SourceText('storage.ts');
  const advancedSource = new SourceText('advanced.ts');
  const diagnosticsSource = new SourceText('diagnostics.ts');
  const packageBins = captureObjectEntries(packageSource, 'bin');
  const packageExports = captureExportEntries(packageSource, 'exports').filter((item) => item.name.startsWith('.'));
  const jsrExports = captureExportEntries(jsrSource, 'exports').filter((item) => item.name.startsWith('.'));
  const commands = captureCommands(registrySource);
  const errors = captureErrorClasses(rootSource);

  return `${[
    '# Source-backed reference',
    '',
    'This page is generated from source code. Do not edit the inventories by hand;',
    'run `node scripts/check-source-backed-reference.ts --write` after changing a',
    'public API export, CLI command, package entrypoint, or public error class.',
    '',
    '## Package entrypoints',
    '',
    table(['Surface', 'Name', 'Target', 'Source'], [
      ...packageBins.map((item) => ['npm bin', `\`${item.name}\``, `\`${item.detail}\``, `\`${item.source}\``]),
      ...packageExports.map((item) => ['npm export', `\`${item.name}\``, `\`${item.detail}\``, `\`${item.source}\``]),
      ...jsrExports.map((item) => ['JSR export', `\`${item.name}\``, `\`${item.detail}\``, `\`${item.source}\``]),
    ]),
    '',
    ...exportSurface('Root API export surface', rootSource, 'First-use product API: one `Runtime` value plus Lane, Intent, Observer, Observation, Reading, and Receipt types.'),
    '',
    ...exportSurface('Storage export surface', storageSource, 'Transitional explicit storage composition; first-use applications use `Runtime.open()`.'),
    '',
    ...exportSurface('Advanced export surface', advancedSource, 'Bounded coordinate capture, Optic, and Witness concepts for expert use.'),
    '',
    ...exportSurface('Diagnostics export surface', diagnosticsSource, 'Operator inspection helpers that consume public receipt handles.'),
    '',
    '## CLI command registry',
    '',
    table(['Command', 'Handler', 'Source'], commands.map((item) => [`\`${item.name}\``, `\`${item.detail}\``, `\`${item.source}\``])),
    '',
    'Structured CLI errors for `--json` and `--ndjson` use the payload shape',
    '`{ error: { code, message, cause? } }` from the CLI entry point.',
    '',
    `Source: \`${requireLineRef(cliSource, 'const payload:')}\`.`,
    '',
    '## Public error classes',
    '',
    ...(errors.length === 0 ? ['The v19 package root does not export error constructors.'] : [table(['Class', 'Module', 'Source'], errors.map((item) => [`\`${item.name}\``, `\`${item.detail}\``, `\`${item.source}\``]))]),
  ].join('\n')}\n`;
}

const expected = generate();
const shouldWrite = process.argv.includes('--write');

if (shouldWrite) { writeFileSync(OUTPUT_PATH, expected); process.exit(0); }

const actual = readFileSync(OUTPUT_PATH, 'utf8');
if (actual !== expected) {
  process.stderr.write(`${OUTPUT_PATH} is stale. Run node scripts/check-source-backed-reference.ts --write\n`);
  process.exit(1);
}
