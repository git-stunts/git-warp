import type PackagePayloadInventory from './PackagePayloadInventory.ts';
import type PackagePayloadPolicy from './PackagePayloadPolicy.ts';

const APPROACHING_LIMIT = 0.85;
const CRITICAL_LIMIT = 0.95;
const DISPLAY_LIMIT = 10;
const MAX_CELL_LENGTH = 240;

/** Renders actual artifact geometry and bounded advisory inspection findings. */
export default function packageBundleReport(
  inventory: PackagePayloadInventory, policy: PackagePayloadPolicy, findings: readonly string[]
): string {
  return [
    '### npm bundle analysis', '',
    '| Metric | Measured | Limit | Usage | Remaining | Assessment |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    metric('Compressed bytes', inventory.packedBytes, policy.maxPackedBytes),
    metric('Unpacked bytes', inventory.unpackedBytes, policy.maxUnpackedBytes),
    metric('Files', inventory.entryCount, policy.maxEntryCount), '',
    'Warnings begin at 85% of a limit; critical headroom begins at 95%. Exceeding a limit fails the existing payload gate.', '',
    payloadGroups(inventory), '',
    warningList([...policy.assess(inventory).violations, ...findings]), '',
    'Static reachability findings are deletion candidates, not proof that a file is safe to remove. Dependency checks cover imports and manifest declarations; they are not a vulnerability audit.', '',
    largestFiles(inventory), '',
  ].join('\n');
}

/** Formats one budget row without masking an exceeded limit. */
function metric(name: string, value: number, limit: number): string {
  const usage = value / limit;
  const status = usage > 1 ? '❌ Limit exceeded' : usage >= CRITICAL_LIMIT ? '⚠️ Critical headroom' :
    usage >= APPROACHING_LIMIT ? '⚠️ Approaching limit' : 'OK';
  return `| ${name} | ${value} | ${limit} | ${percentage(value, limit)} | ${Math.max(0, limit - value)} | ${status} |`;
}

/** Separates declarations, executable modules, and retained assets by unpacked bytes. */
function payloadGroups(inventory: PackagePayloadInventory): string {
  const sum = (suffix: string): number => inventory.entries.filter((entry) => entry.path.endsWith(suffix))
    .reduce((total, entry) => total + entry.size, 0);
  const declarations = sum('.d.ts');
  const javascript = sum('.js');
  return [
    '| Payload group | Unpacked bytes |', '| --- | ---: |',
    `| Declarations | ${declarations} |`, `| JavaScript | ${javascript} |`,
    `| Metadata, documentation, and assets | ${inventory.unpackedBytes - declarations - javascript} |`,
  ].join('\n');
}

/** Caps comment findings while preserving full evidence in the workflow artifact. */
function warningList(warnings: readonly string[]): string {
  const rows = warnings.length === 0 ? ['No static inspection findings.'] :
    warnings.slice(0, DISPLAY_LIMIT).map((warning) => `- ⚠️ ${cell(warning)}`);
  if (warnings.length > DISPLAY_LIMIT) {
    rows.push(`- … ${warnings.length - DISPLAY_LIMIT} additional findings; see the complete analysis artifact.`);
  }
  return [`#### Findings (${warnings.length})`, '', ...rows].join('\n');
}

/** Sorts file sizes descending with an ordinal path tie-break for deterministic reports. */
function largestFiles(inventory: PackagePayloadInventory): string {
  const largest = [...inventory.entries].sort((a, b) => b.size - a.size || comparePath(a.path, b.path));
  return ['#### Largest files (unpacked)', '', '| File | Bytes | Share |', '| --- | ---: | ---: |',
    ...largest.slice(0, DISPLAY_LIMIT).map((entry) =>
      `| ${cell(entry.path)} | ${entry.size} | ${percentage(entry.size, inventory.unpackedBytes)} |`),
  ].join('\n');
}

/** Compares paths independently of the machine locale. */
function comparePath(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** Avoids undefined shares for empty inventories. */
function percentage(value: number, total: number): string {
  return `${(total === 0 ? 0 : value / total * 100).toFixed(1)}%`;
}

/** Keeps untrusted filenames and dependency text inside bounded Markdown cells. */
function cell(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('[', '&#91;').replaceAll(']', '&#93;').replaceAll('`', '&#96;').replaceAll('|', '&#124;').replace(/[\r\n]/gu, ' ').slice(0, MAX_CELL_LENGTH);
}
