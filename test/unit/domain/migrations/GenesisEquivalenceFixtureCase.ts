import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';

export type GenesisEquivalenceFixtureExpectedResult = 'success' | 'failure';

/** Runtime-backed test fixture case for genesis equivalence proof coverage. */
export default class GenesisEquivalenceFixtureCase {
  readonly name: string;
  readonly legacyReading: GenesisEquivalenceReading;
  readonly migratedReading: GenesisEquivalenceReading;
  readonly expectedResult: GenesisEquivalenceFixtureExpectedResult;

  constructor(
    name: string,
    legacyReading: GenesisEquivalenceReading,
    migratedReading: GenesisEquivalenceReading,
    expectedResult: GenesisEquivalenceFixtureExpectedResult,
  ) {
    this.name = name;
    this.legacyReading = legacyReading;
    this.migratedReading = migratedReading;
    this.expectedResult = expectedResult;
    Object.freeze(this);
  }
}
