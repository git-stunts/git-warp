/**
 * Whether a reported plurality rests on recorded causal evidence (`observed`)
 * or involves a patch that recorded none, such as a legacy or facade write
 * (`underdetermined`).
 */
export type PluralityCausality = 'observed' | 'underdetermined';
