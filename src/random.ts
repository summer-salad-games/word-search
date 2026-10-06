import { PuzzleValidationError } from "./errors.js";

export type RandomSource = () => number;

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function checked(source: RandomSource): RandomSource {
  return () => {
    const value = source();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new PuzzleValidationError("random must return a finite number in [0, 1).");
    }
    return value;
  };
}

export function createRandom(seed?: number | string, random?: RandomSource): RandomSource {
  if (seed !== undefined && typeof seed !== "number" && typeof seed !== "string") {
    throw new PuzzleValidationError("seed must be a finite number or a string.");
  }
  if (random !== undefined && typeof random !== "function") {
    throw new PuzzleValidationError("random must be a function when provided.");
  }
  if (seed !== undefined && random !== undefined) {
    throw new PuzzleValidationError("Provide either seed or random, not both.");
  }
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new PuzzleValidationError("seed must be a finite number or a string.");
  }
  return checked(random ?? (seed === undefined ? Math.random : mulberry32(hashSeed(seed))));
}

export function randomIndex(length: number, random: RandomSource): number {
  return Math.floor(random() * length);
}

export function shuffled<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1, random);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
