import type { CliFailureMessageValue } from './CliFailureMessageValue.ts';
import { CLI_FAILURE_MESSAGE_BYTES, failureTextPrefix } from './CliFailureLimits.ts';

/** Sanitizes display text without inspecting arbitrary error metadata. */
export default class CliFailureRedactorAdapter {
  private readonly home: string;
  private readonly directory: string;

  constructor(options: { readonly home: string; readonly directory: string }) {
    this.home = options.home;
    this.directory = options.directory;
  }

  message(text: string): string { return this.display(text).message; }

  display(text: string): CliFailureMessageValue {
    const scanned = failureTextPrefix(text, CLI_FAILURE_MESSAGE_BYTES * 2);
    const sanitized = this.sanitize(scanned);
    const message = failureTextPrefix(sanitized, CLI_FAILURE_MESSAGE_BYTES);
    return { message, truncated: scanned.length < text.length || message.length < sanitized.length };
  }

  private sanitize(text: string): string {
    let result = text;
    // eslint-disable-next-line no-control-regex -- #978: remove terminal CSI controls at the display boundary.
    result = result.replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, '');
    // eslint-disable-next-line no-control-regex -- #978: omit untrusted nonprinting ASCII control bytes.
    result = result.replace(/[\x00-\x08\x0B-\x1F\x7F]/gu, '');
    result = result.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gu, '$1[REDACTED]@');
    result = result.replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]');
    result = result.replace(/\b(?:ghp_|github_pat_)[A-Za-z0-9_]+/gu, '[REDACTED]');
    result = this.paths(result);
    return result;
  }

  private paths(text: string): string {
    let result = text;
    if (this.directory.length > 1) {
      result = result.split(this.directory).join('.');
    }
    if (this.home.length > 1) {
      result = result.split(this.home).join('<HOME>');
    }
    return result.replace(/\/(?:Users|home)\/[^\s/'"]+/gu, '<HOME>');
  }
}
