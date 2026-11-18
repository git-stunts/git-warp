// SPDX-License-Identifier: Apache-2.0

import type { AuditRefusal } from './AuditRefusal.ts';
import type { PublishedVersions } from './PublishedVersions.ts';

/** Port: asks the registry which versions of a package it publishes. */
export interface PackageRegistry {
  /** The `latest` version and the published versions that `vulnerableRange` covers. */
  publishedVersions(packageName: string, vulnerableRange: string): Promise<PublishedVersions | AuditRefusal>;
}
