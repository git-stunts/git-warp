import { z } from 'zod';

const MISSING_PACKAGE = z.object({ error: z.object({ code: z.literal('E404') }) });

/** Decodes npm's JSON stdout without interpreting human-readable error descriptions. */
export default class NpmRegistryProbeDecoder {
  /** Returns the registry string; SemVer validation belongs to the release decision. */
  version(text: string): string | undefined {
    const value = parse(text);
    return typeof value === 'string' ? value : undefined;
  }

  /** Accepts only npm's structured missing-package code, never a substring in prose. */
  isMissingPackage(text: string): boolean {
    return MISSING_PACKAGE.safeParse(parse(text)).success;
  }
}

/** Malformed registry output is an expected boundary failure. */
function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}
