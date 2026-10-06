import { Direction, type PuzzleConfiguration } from "./types.js";

export const DEFAULT_CONFIGURATION: Readonly<PuzzleConfiguration> = Object.freeze({
  gridSize: Object.freeze({ width: 15, height: 17 }),
  borderSize: 1,
  useBorder: true,
  straightness: 0.65,
  reverseWordProbability: 0.5,
  fillPercentage: 0.15,
  wordsOverlap: false,
  selfIntersect: false,
  wordsIntersect: false,
  useBacktracking: true,
  useSmallerWordFallback: true,
  allowedDirections: Object.freeze([
    Direction.up,
    Direction.right,
    Direction.down,
    Direction.left,
  ]),
  fillBorder: true,
  restrictedFillLetters: Object.freeze(["e", "s", "d", "t", "n"]),
  fillLetters: Object.freeze(Array.from("abcdefghijklmnopqrstuvwxyz")),
});
