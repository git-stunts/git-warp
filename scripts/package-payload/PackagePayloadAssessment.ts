export default class PackagePayloadAssessment {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    this.violations = Object.freeze([...violations]);
    Object.freeze(this);
  }

  isAccepted(): boolean {
    return this.violations.length === 0;
  }
}
