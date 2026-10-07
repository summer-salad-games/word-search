import { Direction, generatePuzzle, type Position, type PuzzleResult } from "./index.js";
import type { PuzzleTheme } from "./themes.js";

export const GENERATOR_VERSION = 2;

function randomId(): string {
  if (typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  const values = globalThis.crypto.getRandomValues(new Uint32Array(4));
  return [...values].map((value) => value.toString(16).padStart(8, "0")).join("-");
}

export interface PuzzleProfile {
  readonly columns: number;
  readonly rows: number;
  readonly borderSize: number;
  readonly targetWordCount: number;
  readonly preferredCellSize: number;
}

export interface GameSession {
  readonly id: string;
  readonly themeId: string;
  readonly seed: string;
  readonly puzzle: PuzzleResult;
  readonly targetWords: readonly string[];
  readonly solvedWords: readonly string[];
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly status: "playing" | "completed";
  readonly profile: PuzzleProfile;
  readonly completedAt?: string;
}

export type GameAction =
  | { readonly type: "attempt"; readonly word?: string; readonly elapsedMs: number }
  | { readonly type: "set-elapsed"; readonly elapsedMs: number };

export function gameReducer(session: GameSession, action: GameAction): GameSession {
  if (action.type === "set-elapsed") return { ...session, elapsedMs: action.elapsedMs };
  if (session.status === "completed") return session;
  const solvedWords = action.word === undefined || session.solvedWords.includes(action.word)
    ? session.solvedWords
    : [...session.solvedWords, action.word];
  const completed = solvedWords.length === session.targetWords.length;
  return {
    ...session,
    solvedWords,
    attempts: session.attempts + 1,
    elapsedMs: action.elapsedMs,
    status: completed ? "completed" : "playing",
    ...(completed ? { completedAt: new Date().toISOString() } : {}),
  };
}

export function calculatePuzzleProfile(viewportWidth: number, viewportHeight: number): PuzzleProfile {
  const width = Math.max(280, viewportWidth);
  const height = Math.max(480, viewportHeight);
  if (width < 480) {
    const columns = Math.max(8, Math.min(11, Math.floor((width - 28) / 31) - 2));
    const rows = Math.max(10, Math.min(16, Math.floor((height - 250) / 29) - 2));
    return { columns, rows, borderSize: 1, targetWordCount: Math.max(5, Math.min(7, Math.floor(columns * rows / 20))), preferredCellSize: 31 };
  }
  if (width < 800) {
    const columns = Math.max(11, Math.min(14, Math.floor((width - 48) / 36) - 2));
    const rows = Math.max(14, Math.min(18, Math.floor((height - 250) / 34) - 2));
    return { columns, rows, borderSize: 1, targetWordCount: Math.max(7, Math.min(10, Math.floor(columns * rows / 20))), preferredCellSize: 36 };
  }
  const columns = Math.max(15, Math.min(21, Math.floor((width - 96) / 42) - 2));
  const rows = Math.max(15, Math.min(21, Math.floor((height - 230) / 40) - 2));
  return { columns, rows, borderSize: 1, targetWordCount: Math.max(10, Math.min(14, Math.floor(columns * rows / 20))), preferredCellSize: 42 };
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function orderedWords(words: readonly string[], seed: string): string[] {
  return [...words].sort((left, right) => hash(`${seed}:${left}`) - hash(`${seed}:${right}`));
}

export function generateCompletePuzzle(theme: PuzzleTheme, profile: PuzzleProfile, seed: string): { puzzle: PuzzleResult; targetWords: string[] } {
  const ordered = orderedWords(theme.words, seed);
  const minimumWords = Math.min(4, ordered.length);
  for (let count = Math.min(profile.targetWordCount, ordered.length); count >= minimumWords; count -= 1) {
    const targetWords = ordered.slice(0, count);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const puzzle = generatePuzzle({
        theme: theme.title,
        words: targetWords,
        seed: `${seed}:${attempt}`,
        configuration: {
          gridSize: { width: profile.columns, height: profile.rows },
          borderSize: profile.borderSize,
          useBorder: true,
          allowedDirections: [Direction.up, Direction.right, Direction.down, Direction.left],
          wordsOverlap: false,
          selfIntersect: false,
          wordsIntersect: false,
          fillPercentage: 0.3,
        },
      });
      if (puzzle.unplacedWords.length === 0) return { puzzle, targetWords };
    }
  }
  throw new Error(`Could not place a complete word set for ${theme.title}.`);
}

export function createSession(theme: PuzzleTheme, profile: PuzzleProfile, seed = randomId()): GameSession {
  const { puzzle, targetWords } = generateCompletePuzzle(theme, profile, seed);
  return { id: randomId(), themeId: theme.id, seed, puzzle, targetWords, solvedWords: [], attempts: 0, elapsedMs: 0, status: "playing", profile };
}

export const positionKey = ({ x, y }: Position): string => `${x},${y}`;

export function pathsMatch(selected: readonly Position[], expected: readonly Position[]): boolean {
  if (selected.length !== expected.length) return false;
  const forward = selected.every((position, index) => positionKey(position) === positionKey(expected[index]!));
  const reverse = selected.every((position, index) => positionKey(position) === positionKey(expected[expected.length - index - 1]!));
  return forward || reverse;
}

export function extendSelection(path: readonly Position[], next: Position): Position[] {
  if (path.length === 0) return [next];
  const last = path[path.length - 1]!;
  if (path.length > 1 && positionKey(path[path.length - 2]!) === positionKey(next)) return path.slice(0, -1);
  const distance = Math.abs(last.x - next.x) + Math.abs(last.y - next.y);
  if (distance !== 1 || path.some((position) => positionKey(position) === positionKey(next))) return [...path];
  return [...path, next];
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
