// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

/**
 * npm prints a failure as JSON when `--json` is set: `npm audit` as
 * `{"message": …, "error": {…}}` and `npm view` as `{"error": {"summary": …}}`.
 */
const NPM_FAILURE = z.object({
  message: z.string().optional(),
  error: z.object({ summary: z.string().optional() }).optional(),
});

const NO_MESSAGE = 'npm printed no error message';

/** The most specific error message in npm's JSON failure output. */
export function npmFailureText(value: unknown): string {
  const failure = NPM_FAILURE.safeParse(value);
  const candidates = failure.success ? [failure.data.message, failure.data.error?.summary] : [];
  return candidates.find((text) => text !== undefined && text.length > 0) ?? NO_MESSAGE;
}
