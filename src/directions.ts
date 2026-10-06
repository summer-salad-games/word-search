import { Direction, type Position } from "./types.js";

export const ALL_DIRECTIONS: readonly Direction[] = Object.freeze([
  Direction.up,
  Direction.upRight,
  Direction.right,
  Direction.downRight,
  Direction.down,
  Direction.downLeft,
  Direction.left,
  Direction.upLeft,
]);

const VECTORS: Readonly<Record<Direction, Position>> = Object.freeze({
  [Direction.up]: { x: 0, y: -1 },
  [Direction.upRight]: { x: 1, y: -1 },
  [Direction.right]: { x: 1, y: 0 },
  [Direction.downRight]: { x: 1, y: 1 },
  [Direction.down]: { x: 0, y: 1 },
  [Direction.downLeft]: { x: -1, y: 1 },
  [Direction.left]: { x: -1, y: 0 },
  [Direction.upLeft]: { x: -1, y: -1 },
});

export function directionVector(direction: Direction): Position {
  return VECTORS[direction];
}

export function isDiagonal(direction: Direction): boolean {
  const vector = directionVector(direction);
  return vector.x !== 0 && vector.y !== 0;
}

export function oppositeDirection(direction: Direction): Direction {
  const vector = directionVector(direction);
  const opposite = ALL_DIRECTIONS.find((candidate) => {
    const candidateVector = directionVector(candidate);
    return candidateVector.x === -vector.x && candidateVector.y === -vector.y;
  });
  if (opposite === undefined) throw new Error(`No opposite direction for ${direction}.`);
  return opposite;
}
