import type WriteRace from '../../api/WriteRace.ts';
import type WriteOccurrence from '../../api/WriteOccurrence.ts';
import type { WriteAdmissionKind } from '../../api/WriteAdmission.ts';
import type { PatchBuilder } from '../PatchBuilder.ts';
import type PatchEntryFold from './PatchEntryFold.ts';
import type ObservationBindings from '../custody/ObservationBindings.ts';

/** One write lowered and bound to its premises, not yet published. */
export default class LoweredConeWrite {
  readonly writer: string;
  readonly builder: PatchBuilder;
  readonly bindings: ObservationBindings;
  readonly admission: WriteAdmissionKind;
  readonly races: readonly WriteRace[];
  readonly occurrences: readonly WriteOccurrence[];
  readonly fold: PatchEntryFold;

  constructor(fields: {
    readonly writer: string;
    readonly builder: PatchBuilder;
    readonly bindings: ObservationBindings;
    readonly admission: WriteAdmissionKind;
    readonly races: readonly WriteRace[];
    readonly occurrences: readonly WriteOccurrence[];
    readonly fold: PatchEntryFold;
  }) {
    this.writer = fields.writer;
    this.builder = fields.builder;
    this.bindings = fields.bindings;
    this.admission = fields.admission;
    this.races = Object.freeze([...fields.races]);
    this.occurrences = Object.freeze([...fields.occurrences]);
    this.fold = fields.fold;
    Object.freeze(this);
  }
}
