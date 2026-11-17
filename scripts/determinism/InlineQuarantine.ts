// SPDX-License-Identifier: Apache-2.0

const RULE_ID_FORM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The anti-sludge policy's narrow inline quarantine for one Semgrep rule
 * (docs/ANTI_SLUDGE_POLICY.md section 11): a source line that carries
 * `nosemgrep: <rule> -- <ticket>` is a recorded, rule-scoped exception to that
 * rule. A marker without a ticket reference, or one that names a list of
 * rules, does not count.
 */
export class InlineQuarantine {
  readonly rule: string;
  private readonly marker: RegExp;

  constructor(rule: string) {
    if (!RULE_ID_FORM.test(rule)) {
      throw new RangeError(`Inline quarantine rule ids are lowercase kebab-case; got ${rule}`);
    }
    this.rule = rule;
    this.marker = new RegExp(`\\bnosemgrep:\\s*${rule}\\s+--\\s+\\S`);
    Object.freeze(this);
  }

  /** True when `line` carries this rule's inline quarantine marker. */
  covers(line: string): boolean {
    return this.marker.test(line);
  }
}
