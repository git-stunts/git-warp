/** A patch folded into a cone session: which patch, and how many records it changed. */
export default class ConeFolded {
  readonly patchSha: string;
  readonly changedRecords: number;

  constructor(patchSha: string, changedRecords: number) {
    this.patchSha = patchSha;
    this.changedRecords = changedRecords;
    Object.freeze(this);
  }
}
