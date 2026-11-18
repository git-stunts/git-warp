// SPDX-License-Identifier: Apache-2.0

/** A parsed JSON value, wrapped so that a parse failure is distinct from the JSON value `null`. */
export type ParsedJson = {
  readonly value: unknown;
};

/** Parses JSON text. Returns null when the text is not JSON. */
export function parseJsonText(text: string): ParsedJson | null {
  try {
    const value: unknown = JSON.parse(text);
    return { value };
  } catch {
    return null;
  }
}
