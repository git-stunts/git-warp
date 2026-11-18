// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { AuditRefusal } from '../AuditRefusal.ts';
import type { CommandResult } from './CommandRunner.ts';
import { npmFailureText } from './npmFailureText.ts';
import { parseJsonText } from './parseJsonText.ts';

const ONE_VERSION = z.string().min(1);
/** `npm view <package>@<range> version --json` prints one match as a string and several as an array. */
const VERSION_LIST = z.union([ONE_VERSION.transform((version) => [version]), z.array(ONE_VERSION).min(1)]);

/** Decodes `npm view <package> version --json`: the version that the `latest` dist-tag names. */
export function decodeNpmViewVersion(result: CommandResult, command: string): string | AuditRefusal {
  return decodeNpmView(result, command, ONE_VERSION);
}

/** Decodes `npm view <package>@<range> version --json`: every published version inside the range. */
export function decodeNpmViewVersionList(result: CommandResult, command: string): readonly string[] | AuditRefusal {
  return decodeNpmView(result, command, VERSION_LIST);
}

function decodeNpmView<T>(result: CommandResult, command: string, schema: z.ZodType<T>): T | AuditRefusal {
  const parsed = parseJsonText(result.stdout);
  if (result.exitCode !== 0 || parsed === null) {
    return new AuditRefusal(`${command} failed with exit code ${result.exitCode}: ${npmFailureText(parsed?.value)}`);
  }
  const decoded = schema.safeParse(parsed.value);
  return decoded.success ? decoded.data : new AuditRefusal(`${command} did not print a version`);
}
