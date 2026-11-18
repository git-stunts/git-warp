// SPDX-License-Identifier: Apache-2.0

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

/** A UTC calendar day such as 2026-11-17. Exception windows count whole days. */
export class CalendarDate {
  /** Days since 1970-01-01. */
  readonly epochDay: number;
  /** The `YYYY-MM-DD` spelling. */
  readonly iso: string;

  private constructor(epochDay: number) {
    this.epochDay = epochDay;
    this.iso = new Date(epochDay * MILLISECONDS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
    Object.freeze(this);
  }

  /** Reads `YYYY-MM-DD`. Returns null for other text and for a day that does not exist. */
  static parse(text: string): CalendarDate | null {
    const match = ISO_DATE.exec(text);
    if (match === null) {
      return null;
    }
    const instant = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const date = CalendarDate.containing(instant);
    return date.iso === text ? date : null;
  }

  /** The UTC day that contains an instant, given in milliseconds since the Unix epoch. */
  static containing(epochMilliseconds: number): CalendarDate {
    if (!Number.isFinite(epochMilliseconds)) {
      throw new RangeError('A calendar date needs a finite instant');
    }
    return new CalendarDate(Math.floor(epochMilliseconds / MILLISECONDS_PER_DAY));
  }

  /** Whole days from this date to `later`; negative when `later` is earlier. */
  daysUntil(later: CalendarDate): number {
    return later.epochDay - this.epochDay;
  }
}
