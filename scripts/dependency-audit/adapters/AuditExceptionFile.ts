// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { GHSA_ID } from '../AuditAdvisory.ts';
import { AuditException } from '../AuditException.ts';
import { AUDIT_EXCEPTIONS_PATH, AuditExceptionList } from '../AuditExceptionList.ts';
import { AuditRefusal } from '../AuditRefusal.ts';
import { CalendarDate } from '../CalendarDate.ts';
import { parseJsonText } from './parseJsonText.ts';

/** npm's package-name rule: lowercase, URL-safe, optionally scoped. */
const NPM_PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/u;
/** A same-host issue or pull request reference, such as git-stunts/git-warp#1194. */
const OWNER_REFERENCE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+#[1-9]\d*$/u;

const DATE = z.string().transform((text, context) => {
  const date = CalendarDate.parse(text);
  if (date === null) {
    context.addIssue({ code: 'custom', message: `${text} is not a calendar date (YYYY-MM-DD)` });
    return z.NEVER;
  }
  return date;
});

const ENTRY = z.strictObject({
  advisory: z.string().regex(GHSA_ID, 'must be a GHSA identifier such as GHSA-fc5q-39xc-vjpf'),
  package: z.string().regex(NPM_PACKAGE_NAME, 'must be an npm package name'),
  reason: z.string().refine((text) => text.trim().length > 0, 'must not be empty'),
  added: DATE,
  expires: DATE,
  owner: z.string().regex(OWNER_REFERENCE, 'must be an owner/repo#N issue or pull request reference'),
});

const FILE = z.strictObject({ exceptions: z.array(ENTRY) });

/** Reads and decodes `policy/audit-exceptions.json` under `root`. */
export async function readAuditExceptions(root: string): Promise<AuditExceptionList | AuditRefusal> {
  try {
    return decodeAuditExceptions(await readFile(join(root, AUDIT_EXCEPTIONS_PATH), 'utf8'));
  } catch (error: unknown) {
    return new AuditRefusal(`cannot read ${AUDIT_EXCEPTIONS_PATH}: ${String(error)}`);
  }
}

/** Decodes the exception list. Unknown keys, malformed values and duplicates are refusals. */
export function decodeAuditExceptions(text: string): AuditExceptionList | AuditRefusal {
  const parsed = parseJsonText(text);
  if (parsed === null) {
    return new AuditRefusal(`${AUDIT_EXCEPTIONS_PATH} is not JSON`);
  }
  const file = FILE.safeParse(parsed.value);
  if (!file.success) {
    return new AuditRefusal(`${AUDIT_EXCEPTIONS_PATH} is invalid: ${file.error.issues.map(issueText).join('; ')}`);
  }
  return AuditExceptionList.of(file.data.exceptions.map((entry) => new AuditException({
    advisory: entry.advisory,
    packageName: entry.package,
    reason: entry.reason,
    added: entry.added,
    expires: entry.expires,
    owner: entry.owner,
  })));
}

/** `exceptions.0.owner: <message>`, or the bare message for a problem with the whole file. */
function issueText(issue: z.core.$ZodIssue): string {
  return issue.path.length === 0 ? issue.message : `${issue.path.map(String).join('.')}: ${issue.message}`;
}
