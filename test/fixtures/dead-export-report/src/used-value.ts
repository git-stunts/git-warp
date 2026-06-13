export class UsedValue {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }
}
