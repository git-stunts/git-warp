/**
 * `cone-basis-lag` (#1039): how far this clone's cone basis trails each
 * writer chain, counted in patches not yet folded. Public reads and writes
 * fold them on their own, so lag is a cost forecast, not a fault; a writer
 * chain that no longer extends what the basis folded is a fault.
 *
 * @module cli/commands/doctor/checksConeBasis
 */

import ConeBasisHead from '../../../../src/domain/services/cone/ConeBasisHead.ts';
import type ConeFrontier from '../../../../src/domain/services/cone/ConeFrontier.ts';
import { CODES } from './codes.ts';
import type { DoctorContext, DoctorFinding } from './types.ts';

const ID = 'cone-basis-lag';
const BASIS_REPAIR = 'Run `git warp repair --lane <name> --action basis` to fold them now';

/** Per writer, the patches its chain holds past the folded position, and the chains that no longer extend it. */
type BasisLag = { readonly unfolded: Map<string, number>; readonly diverged: string[] };

/** Report the patches each writer has that the lane's cone basis has not folded yet. */
export async function checkConeBasisLag(ctx: DoctorContext): Promise<DoctorFinding> {
  try {
    if (ctx.coneRecords === null) {
      return unavailableFinding();
    }
    const stored = await ctx.coneRecords.readBasis(ConeBasisHead.forLane(ctx.graphName));
    return lagFinding(await collectLags(ctx, stored === null ? null : stored.basis.frontier), ctx.policy.coneBasisLagWarnPatches);
  } catch (err) {
    return internalErrorFinding(err);
  }
}

async function collectLags(ctx: DoctorContext, frontier: ConeFrontier | null): Promise<BasisLag> {
  const lag: BasisLag = { unfolded: new Map(), diverged: [] };
  for (const head of ctx.writerHeads) {
    // A dangling head is reported by refs-consistent.
    if (head.sha !== null) {
      const unfolded = await unfoldedPatches(ctx, { tip: head.sha, folded: foldedSha(frontier, head.writerId) });
      if (unfolded === 'diverged') { lag.diverged.push(head.writerId); } else { lag.unfolded.set(head.writerId, unfolded); }
    }
  }
  return lag;
}

function foldedSha(frontier: ConeFrontier | null, writerId: string): string | null {
  const position = frontier === null ? null : frontier.position(writerId);
  return position === null ? null : position.sha;
}

/** Patches of one writer chain after its folded position; one count per endpoint, no patch is read. */
async function unfoldedPatches(
  ctx: DoctorContext,
  chain: { readonly tip: string; readonly folded: string | null },
): Promise<number | 'diverged'> {
  if (chain.folded === chain.tip) {
    return 0;
  }
  if (chain.folded === null) {
    return await ctx.persistence.countNodes(chain.tip);
  }
  if (!(await ctx.persistence.isAncestor(chain.folded, chain.tip))) {
    return 'diverged';
  }
  return await ctx.persistence.countNodes(chain.tip) - await ctx.persistence.countNodes(chain.folded);
}

function unavailableFinding(): DoctorFinding {
  return {
    id: ID, status: 'warn', code: CODES.CONE_BASIS_UNAVAILABLE, impact: 'operability',
    message: 'This storage keeps no cone records; public reads and writes cannot run',
  };
}

function internalErrorFinding(err: unknown): DoctorFinding {
  return {
    id: ID, status: 'fail', code: CODES.CHECK_INTERNAL_ERROR, impact: 'data_integrity',
    message: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
  };
}

function lagFinding(lag: BasisLag, warnAt: number): DoctorFinding {
  if (lag.diverged.length > 0) {
    return {
      id: ID, status: 'fail', code: CODES.CONE_BASIS_DIVERGED, impact: 'operability',
      message: `Writer chain(s) ${lag.diverged.join(', ')} no longer extend what the cone basis folded; reads report cone_writer_diverged`,
      fix: 'Delete the clone-local refs/warp/<lane>/cone/head ref, then run `git warp repair --lane <name> --action basis` to refold from the writer chains',
      evidence: { divergedWriters: lag.diverged },
    };
  }
  const total = [...lag.unfolded.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return {
      id: ID, status: 'ok', code: CODES.CONE_BASIS_CURRENT, impact: 'operability',
      message: 'Cone basis folds every writer tip', evidence: { writers: lag.unfolded.size },
    };
  }
  return {
    id: ID, status: total > warnAt ? 'warn' : 'ok', code: CODES.CONE_BASIS_LAGGING, impact: 'operability',
    message: `${total} patch(es) are not folded into the cone basis yet; the next read or write folds them`,
    fix: BASIS_REPAIR, evidence: { unfoldedPatches: total, unfolded: Object.fromEntries(lag.unfolded), warnAt },
  };
}
