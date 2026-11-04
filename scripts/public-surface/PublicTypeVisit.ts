import type ts from 'typescript';

/** An explicit worklist entry keeps recursive public shapes off the call stack. */
export default class PublicTypeVisit {
  readonly type: ts.Type;
  readonly path: string;

  constructor(type: ts.Type, path: string) {
    if (path.length === 0) throw new TypeError('A public type visit needs an export route');
    this.type = type;
    this.path = path;
    Object.freeze(this);
  }
}
