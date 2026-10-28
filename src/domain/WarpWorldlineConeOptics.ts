import ConeObstructedError from './errors/ConeObstructedError.ts';
import WarpError from './errors/WarpError.ts';
import ConeBasis from './services/cone/ConeBasis.ts';
import type ConeLaneBasis from './services/cone/ConeLaneBasis.ts';
import type ConeObstruction from './services/cone/ConeObstruction.ts';
import LiveConeReadBasis from './services/cone/LiveConeReadBasis.ts';
import PinnedConeReadBasis from './services/cone/PinnedConeReadBasis.ts';
import OpticCoordinatePosture from './services/optic/OpticCoordinatePosture.ts';
import WorldlineOptic from './services/optic/WorldlineOptic.ts';
import WarpWorldlineCoordinate from './WarpWorldlineCoordinate.ts';

/** The cone basis each captured coordinate pins, for the runtime that captured it. */
const coordinateBases = new WeakMap<WarpWorldlineCoordinate, ConeBasis>();

/**
 * Captures one coordinate over a Lane's cone basis (#1039): the basis folds
 * its new patches once, and every Reading through the coordinate's optic
 * reads that one basis. An Observation's coordinate lives as long as the
 * Observation, so it is not retained.
 */
export async function captureConeCoordinate(worldlineName: string, cone: ConeLaneBasis): Promise<WarpWorldlineCoordinate> {
  return coneCoordinate(worldlineName, cone, await cone.advance());
}

/**
 * Captures a coordinate an application may keep (`captureCoordinate`): like
 * {@link captureConeCoordinate}, but its basis is retained so the coordinate
 * still reads after the Lane moves on and Git prunes unreachable objects.
 */
export async function captureRetainedConeCoordinate(worldlineName: string, cone: ConeLaneBasis): Promise<WarpWorldlineCoordinate> {
  return coneCoordinate(worldlineName, cone, await cone.capture());
}

/** A live optic over a Lane's cone basis: each read folds the Lane's new patches first. */
export function liveConeOptic(worldlineName: string, cone: ConeLaneBasis): WorldlineOptic {
  return new WorldlineOptic({
    worldline: worldlineName,
    cone: new LiveConeReadBasis(cone),
    coordinatePosture: OpticCoordinatePosture.liveOneOff(),
  });
}

/** The cone basis a coordinate this runtime captured pins. */
export function coordinateConeBasis(coordinate: WarpWorldlineCoordinate): ConeBasis {
  const basis = coordinateBases.get(coordinate);
  if (basis === undefined) {
    throw new WarpError('Coordinate was not captured by this runtime', 'E_WARP_WORLDLINE_COORDINATE', {
      context: { field: 'coneBasis' },
    });
  }
  return basis;
}

function coneCoordinate(
  worldlineName: string,
  cone: ConeLaneBasis,
  basis: ConeBasis | ConeObstruction,
): WarpWorldlineCoordinate {
  if (!(basis instanceof ConeBasis)) {
    throw new ConeObstructedError(worldlineName, basis);
  }
  const coordinate = new WarpWorldlineCoordinate({
    worldlineName,
    coneRoot: basis.root.toString(),
    frontier: new Map(basis.writerHeads()),
    createOptic: () => new WorldlineOptic({
      worldline: worldlineName,
      cone: new PinnedConeReadBasis(cone, basis),
      coordinatePosture: OpticCoordinatePosture.capturedCoordinate(),
    }),
  });
  coordinateBases.set(coordinate, basis);
  return coordinate;
}
