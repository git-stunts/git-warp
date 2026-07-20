import type CompletedAdmissionExecution from './CompletedAdmissionExecution.ts';
import type FailedAdmissionExecution from './FailedAdmissionExecution.ts';

export type AdmissionExecution = CompletedAdmissionExecution | FailedAdmissionExecution;
