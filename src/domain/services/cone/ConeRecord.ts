import type ConeAdjacencyPage from './ConeAdjacencyPage.ts';
import type ConeAdmissionRecord from './ConeAdmissionRecord.ts';
import type ConeAdmissionTally from './ConeAdmissionTally.ts';
import type ConeUnprovenAdmissionRecord from './ConeUnprovenAdmissionRecord.ts';
import type ConeDotPage from './ConeDotPage.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';

/**
 * One record of a cone record trie. Each member is a runtime-backed class
 * that knows its own `key()`; storage and folds dispatch with `instanceof`.
 */
export type ConeRecord =
  | ConeNodeRecord
  | ConeEdgeRecord
  | ConeDotPage
  | ConeAdjacencyPage
  | ConeAdmissionTally
  | ConeAdmissionRecord
  | ConeUnprovenAdmissionRecord;
