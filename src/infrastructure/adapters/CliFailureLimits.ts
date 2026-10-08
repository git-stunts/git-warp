/** Conservative display bounds, not measured performance targets. */
export const CLI_FAILURE_MAX_DEPTH = 4;
export const CLI_FAILURE_MAX_NODES = 8;
export const CLI_FAILURE_MESSAGE_BYTES = 1024;
export const CLI_FAILURE_OUTPUT_BYTES = 8192;
export const CLI_FAILURE_INTERNAL_EXIT = 3;

/** Takes a UTF-8 prefix without splitting a Unicode code point. */
export function failureTextPrefix(text: string, maximum: number): string {
  let result = '';
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const character of text) {
    bytes += encoder.encode(character).length;
    if (bytes > maximum) { break; }
    result += character;
  }
  return result;
}
