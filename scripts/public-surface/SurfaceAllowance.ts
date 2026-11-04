import SurfaceRefusal from './SurfaceRefusal.ts';

export default class SurfaceAllowance {
  readonly owner: number;
  readonly key: string;

  constructor(owner: number, key: string) {
    if (!Number.isSafeInteger(owner) || owner <= 0 || !key || /[\r\n\t]/u.test(key)) {
      throw new TypeError('Invalid public surface allowance');
    }
    this.owner = owner;
    this.key = key;
    Object.freeze(this);
  }

  line(): string {
    return `${this.owner}\t${this.key}`;
  }

  static parse(line: string): SurfaceAllowance | SurfaceRefusal {
    const match = /^([1-9][0-9]*)\t([^\t\r\n]+)$/u.exec(line);
    if (match === null) return new SurfaceRefusal('Malformed public surface allowance');
    const owner = Number(match[1]);
    const key = match[2];
    if (!Number.isSafeInteger(owner) || key === undefined) return new SurfaceRefusal('Invalid allowance owner or key');
    return new SurfaceAllowance(owner, key);
  }
}
