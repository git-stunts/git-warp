import GraphModelMigrationFinalizationRequest
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationRequest.ts';
import GraphModelMigrationFinalizationSafetyResult
  from '../../../../src/domain/migrations/GraphModelMigrationFinalizationSafetyResult.ts';
import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';

/** Applies operator-reviewed finalization evidence to the live safety result. */
export function reviewedGraphModelMigrationFinalizationSafetyResult(
  safetyResult: GraphModelMigrationFinalizationSafetyResult,
  reviewedRequest: GraphModelMigrationFinalizationRequest | null,
): GraphModelMigrationFinalizationSafetyResult {
  if (reviewedRequest === null) {
    return safetyResult;
  }
  const reviewFatalErrors = finalizationReviewFatalErrors(safetyResult.request, reviewedRequest);
  if (reviewFatalErrors.length === 0) {
    return safetyResult;
  }
  return new GraphModelMigrationFinalizationSafetyResult({
    request: safetyResult.request,
    fatalErrors: reviewFatalErrors.concat(safetyResult.fatalErrors),
  });
}

function finalizationReviewFatalErrors(
  actual: GraphModelMigrationFinalizationRequest,
  reviewed: GraphModelMigrationFinalizationRequest,
): readonly GraphModelMigrationNotice[] {
  const mismatches = finalizationReviewMismatches(actual, reviewed);
  if (mismatches.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze([
    GraphModelMigrationNotice.fatal(
      'E_FINALIZATION_REVIEW_MISMATCH',
      `finalization review artifact does not match observed command evidence: ${mismatches.join(', ')}`,
    ),
  ]);
}

function finalizationReviewMismatches(
  actual: GraphModelMigrationFinalizationRequest,
  reviewed: GraphModelMigrationFinalizationRequest,
): readonly string[] {
  return Object.freeze([
    stringMismatch('liveRefName', actual.liveRefName, reviewed.liveRefName),
    stringMismatch('expectedLiveHead', actual.expectedLiveHead, reviewed.expectedLiveHead),
    stringMismatch('observedLiveHead', actual.observedLiveHead, reviewed.observedLiveHead),
    stringMismatch('scratchRef', actual.scratchRef?.refName ?? null, reviewed.scratchRef?.refName ?? null),
    stringMismatch('scratchHead', actual.scratchHead, reviewed.scratchHead),
    stringMismatch('archiveRefName', actual.archiveRefName, reviewed.archiveRefName),
    stringMismatch('confirmation', actual.confirmation?.token ?? null, reviewed.confirmation?.token ?? null),
    stringMismatch('equivalence', equivalenceSummaryKey(actual), equivalenceSummaryKey(reviewed)),
    stringMismatch('runtimeConformance', runtimeConformanceKey(actual), runtimeConformanceKey(reviewed)),
  ].filter((mismatch) => mismatch !== null));
}

function stringMismatch(label: string, actual: string | null, reviewed: string | null): string | null {
  if (actual === reviewed) {
    return null;
  }
  return label;
}

function equivalenceSummaryKey(request: GraphModelMigrationFinalizationRequest): string | null {
  const gateResult = request.gateResult;
  if (gateResult === null) {
    return null;
  }
  const summary = gateResult.proofResult.summary;
  return evidenceKey([
    summary.basis.toKey(),
    summary.legacyFactCount,
    summary.migratedFactCount,
    summary.mismatchCount,
    gateResult.allowsPromotion() ? 'passed' : 'blocked',
    noticeListKey(gateResult.fatalErrors),
  ]);
}

function runtimeConformanceKey(request: GraphModelMigrationFinalizationRequest): string | null {
  const runtimeConformance = request.runtimeConformance;
  if (runtimeConformance === null) {
    return null;
  }
  return evidenceKey([
    runtimeConformance.scratchRef.refName,
    runtimeConformance.scratchHead,
    runtimeConformance.status,
    runtimeConformance.witness,
    noticeListKey(runtimeConformance.fatalErrors),
  ]);
}

function noticeListKey(notices: readonly GraphModelMigrationNotice[]): string {
  return evidenceKey(notices.map((notice) => evidenceKey([
    notice.kind,
    notice.code,
    notice.message,
  ])));
}

function evidenceKey(parts: readonly (string | number)[]): string {
  return parts.map((part) => {
    const text = String(part);
    return `${text.length}:${text}`;
  }).join('');
}
