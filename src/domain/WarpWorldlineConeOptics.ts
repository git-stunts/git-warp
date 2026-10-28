import ConeObstructedError from './errors/ConeObstructedError.ts';
import ConeBasis from './services/cone/ConeBasis.ts';
import type ConeLaneBasis from './services/cone/ConeLaneBasis.ts';
import LiveConeReadBasis from './services/cone/LiveConeReadBasis.ts';
import PinnedConeReadBasis from './services/cone/PinnedConeReadBasis.ts';
import OpticCoordinatePosture from './services/optic/OpticCoordinatePosture.ts';
import WorldlineOptic from './services/optic/WorldlineOptic.ts';
import WarpWorldlineCoordinate from './WarpWorldlineCoordinate.ts';

/**
 * Captures one coordinate over a lane's cone basis (#1039): the lane folds
 * its new patches once, and every Reading through the coordinate's optic
 * reads that one basis.
 */
export async function captureConeCoordinate(worldlineName: string, cone: ConeLaneBasis): Promise<WarpWorldlineCoordinate> {
  const basis = await cone.advance();
  if (!(basis instanceof ConeBasis)) {
    throw new ConeObstructedError(worldlineName, basis);
  }
  return new WarpWorldlineCoordinate({
    worldlineName,
    coneRoot: basis.root.toString(),
    frontier: new Map(basis.writerHeads()),
    createOptic: () => new WorldlineOptic({
      worldline: worldlineName,
      cone: new PinnedConeReadBasis(cone, basis),
      coordinatePosture: OpticCoordinatePosture.capturedCoordinate(),
    }),
  });
}

/** A live optic over a lane's cone basis: each read folds the lane's new patches first. */
export function liveConeOptic(worldlineName: string, cone: ConeLaneBasis): WorldlineOptic {
  return new WorldlineOptic({
    worldline: worldlineName,
    cone: new LiveConeReadBasis(cone),
    coordinatePosture: OpticCoordinatePosture.liveOneOff(),
  });
}
