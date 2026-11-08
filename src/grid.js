// The street grid, as plain numbers (no three.js, so tests and the river course can use it): 25 x 25 road lines 180 m apart, every
// fourth one a boulevard, and the blocks between them.
import { hash3 } from './util.js';

export const SP = 180;            // distance between road centre lines
export const N = 12;              // lines run from -N to N on both axes
export const isBlvd = k => (((k % 4) + 4) % 4) === 0;     // every fourth road is a boulevard
export const hw = k => (isBlvd(k) ? 16 : 9);              // road half width
export const medianHalf = k => (isBlvd(k) ? 2.5 : 0);
export const laneW = k => (isBlvd(k) ? 4 : 3.8);
export const laneCount = k => (isBlvd(k) ? 3 : 2);
export const laneOffset = (k, lane) => medianHalf(k) + laneW(k) * (lane + 0.5);
export const SIDEWALK = 5;
export const EDGE = N * SP + hw(N);   // outer edge of the ring road
export const LIMIT = EDGE + 420;      // how far out you can drive
const R = 2;                          // blocks per region side
export const REGION = R * SP;
// Blocks given over to a lake (the two ends of the river, see rivercourse.js) are parks too.
export const LAKE_BLOCKS = [[-6, -2], [5, -1]];
export const isLakeBlock = (i, j) => LAKE_BLOCKS.some(b => b[0] === i && b[1] === j);
// Blocks that hold a landmark (landmarks.js): they get no ordinary buildings. The wheel stands in a park.
export const LANDMARKS = { '-1,1': 'tower', '3,4': 'stadium', '-3,3': 'cathedral', '3,-3': 'wheel' };
export const landmarkAt = (i, j) => LANDMARKS[i + ',' + j] || null;
export const isPark = (i, j) => isLakeBlock(i, j) || landmarkAt(i, j) === 'wheel' || (Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)) > 1.6 && hash3(i, j, 99) < 0.065);
export function blockRect(i, j) { return { x0: i * SP + hw(i), x1: (i + 1) * SP - hw(i + 1), z0: j * SP + hw(j), z1: (j + 1) * SP - hw(j + 1) }; }

// Blocks given over to a signature skyscraper, each a different shape (city.js builds them), and the plaza blocks (a paved square with a
// fountain, trees and market stalls instead of buildings). Both are decided by the block's number, so everything agrees on where they are.
export const SIGNATURE = { '0,0': 'crown', '-1,0': 'twist', '1,0': 'pyramid', '0,1': 'twin', '1,1': 'round', '-2,0': 'lean', '2,0': 'portal', '-2,1': 'needle', '1,2': 'terrace', '0,-3': 'blade', '-3,0': 'needle', '2,1': 'lean', '-3,1': 'twist', '2,2': 'crown' };
export const signatureAt = (i, j) => SIGNATURE[i + ',' + j] || null;
export const isPlaza = (i, j) => Math.abs(i) < N && Math.abs(j) < N && Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)) > 2.6 && hash3(i, j, 77) < 0.055 && !isLakeBlock(i, j) && !landmarkAt(i, j) && !signatureAt(i, j) && !(j === -1 || j === -2) ;
