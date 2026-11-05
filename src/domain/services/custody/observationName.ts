const LONE_SURROGATE = /[\ud800-\udfff]/u;

/**
 * A non-empty name that canonical encoding keeps. A lone surrogate does not survive
 * it: longer strings silently become U+FFFD, so two names could share one encoding.
 */
export function isObservationName(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !LONE_SURROGATE.test(value);
}
