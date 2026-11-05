/** The entity one `entity.add` intent admitted, by its position in the submitted sequence. */
export default class WriteOccurrence {
  readonly intentIndex: number;
  readonly subject: string;

  constructor(intentIndex: number, subject: string) {
    this.intentIndex = intentIndex;
    this.subject = subject;
    Object.freeze(this);
  }
}
