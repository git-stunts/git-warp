import { readFileSync, writeFileSync } from 'node:fs';
import { formatFailure } from '../formatFailure.ts';
import { decodeNpmPackInventory } from './adapters/NpmPackInventoryJsonAdapter.ts';
import inspectPackageBundle from './InspectPackageBundle.ts';
import packageBundleReport from './PackageBundleReport.ts';
import PackagePayloadPolicy from './PackagePayloadPolicy.ts';
import PackagePayloadError from './PackagePayloadError.ts';

try {
  const [directory, inventoryPath, reportPath, findingsPath] = process.argv.slice(2);
  if (!directory || !inventoryPath || !reportPath || !findingsPath) {
    throw new PackagePayloadError('usage: ReportPackagePayload.ts PACKAGE INVENTORY REPORT FINDINGS');
  }
  const inventory = decodeNpmPackInventory(readFileSync(inventoryPath, 'utf8'));
  const findings = inspectPackageBundle(directory, inventory);
  const policy = new PackagePayloadPolicy();
  writeFileSync(reportPath, packageBundleReport(inventory, policy, findings));
  writeFileSync(findingsPath, [...policy.assess(inventory).violations, ...findings].join('\n') + '\n');
} catch (error) {
  process.stderr.write(`bundle-analysis: ${formatFailure(error)}\n`);
  process.exitCode = 1;
}
