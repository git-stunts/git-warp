import type CustodyAcknowledged from './CustodyAcknowledged.ts';
import type CustodyEvidence from './CustodyEvidence.ts';
import type CustodyIndeterminate from './CustodyIndeterminate.ts';
import type CustodyInspection from './CustodyInspection.ts';
import type CustodyRefused from './CustodyRefused.ts';

export type CustodyTransition = CustodyAcknowledged | CustodyRefused | CustodyIndeterminate;
export type CustodyObservation = CustodyInspection | CustodyRefused | CustodyIndeterminate;
export type CustodyEvidenceOutcome = CustodyEvidence | CustodyRefused | CustodyIndeterminate;
