import type ConeLaneBasis from '../cone/ConeLaneBasis.ts';

/**
 * The cone bases of one opened strand (#1039): `base` is the lane basis the
 * strand was forked from, pinned at its base frontier; `strand` is that base
 * with the strand's own patches folded on top, which its reads, read-before
 * writes and settlement previews use.
 */
export default class StrandConeBasis {
  readonly strandId: string;
  readonly base: ConeLaneBasis;
  readonly strand: ConeLaneBasis;

  constructor(fields: { readonly strandId: string; readonly base: ConeLaneBasis; readonly strand: ConeLaneBasis }) {
    this.strandId = fields.strandId;
    this.base = fields.base;
    this.strand = fields.strand;
    Object.freeze(this);
  }
}
