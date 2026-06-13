export class UnusedValue {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }
}
