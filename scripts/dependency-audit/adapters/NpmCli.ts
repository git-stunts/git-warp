// SPDX-License-Identifier: Apache-2.0

import { AuditRefusal } from '../AuditRefusal.ts';
import type { AuditReport } from '../AuditReport.ts';
import type { AuditSource } from '../AuditSource.ts';
import type { PackageRegistry } from '../PackageRegistry.ts';
import { PublishedVersions } from '../PublishedVersions.ts';
import type { CommandResult, CommandRunner } from './CommandRunner.ts';
import { decodeNpmAuditReport } from './decodeNpmAuditReport.ts';
import { decodeNpmViewVersion, decodeNpmViewVersionList } from './decodeNpmView.ts';

const NPM = 'npm';

/** Adapter: the audit and registry ports, through the npm command line. */
export class NpmCli implements AuditSource, PackageRegistry {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner) {
    this.runner = runner;
    Object.freeze(this);
  }

  auditPublishedTree(): Promise<AuditReport | AuditRefusal> {
    return this.audit(['audit', '--json', '--omit=dev']);
  }

  auditFullTree(): Promise<AuditReport | AuditRefusal> {
    return this.audit(['audit', '--json']);
  }

  async publishedVersions(packageName: string, vulnerableRange: string): Promise<PublishedVersions | AuditRefusal> {
    const latest = await this.view(['view', packageName, 'version', '--json'], decodeNpmViewVersion);
    if (latest instanceof AuditRefusal) {
      return latest;
    }
    const vulnerable = await this.view(['view', `${packageName}@${vulnerableRange}`, 'version', '--json'], decodeNpmViewVersionList);
    return vulnerable instanceof AuditRefusal ? vulnerable : new PublishedVersions({ latest, vulnerable });
  }

  private async audit(args: readonly string[]): Promise<AuditReport | AuditRefusal> {
    const result = await this.runner.run(NPM, args);
    return result instanceof AuditRefusal ? result : decodeNpmAuditReport(result.stdout, commandText(args));
  }

  private async view<T>(
    args: readonly string[],
    decode: (result: CommandResult, command: string) => T | AuditRefusal,
  ): Promise<T | AuditRefusal> {
    const result = await this.runner.run(NPM, args);
    return result instanceof AuditRefusal ? result : decode(result, commandText(args));
  }
}

function commandText(args: readonly string[]): string {
  return [NPM, ...args].join(' ');
}
