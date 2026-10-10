import { Direction, generatePuzzle, PuzzleGenerationError, type Position, type PuzzleResult } from "./index.js";
import type { PuzzleTheme } from "./themes.js";

const ATTEMPTS_PER_WORD_COUNT = 4;
const MAX_COMPLETE_PUZZLE_ATTEMPTS = 52;

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
  readonly solvedColors: Readonly<Record<string, string>>;
  readonly lettersSelected: number;
  readonly elapsedMs: number;
  readonly status: "playing" | "completed";
  readonly profile: PuzzleProfile;
  readonly completedAt?: string;
}

export type GameAction =
  | { readonly type: "selection"; readonly word?: string; readonly color: string; readonly letterCount: number; readonly elapsedMs: number }
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
    solvedColors: action.word === undefined || session.solvedWords.includes(action.word)
      ? session.solvedColors
      : { ...session.solvedColors, [action.word]: action.color },
    lettersSelected: session.lettersSelected + action.letterCount,
    elapsedMs: action.elapsedMs,
    status: completed ? "completed" : "playing",
    ...(completed ? { completedAt: new Date().toISOString() } : {}),
  };
}

export function calculatePuzzleProfile(screenWidth: number, screenHeight: number): PuzzleProfile {
  const width = screenWidth;
  const height = screenHeight;
  const wordCount = (columns: number, rows: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, Math.floor(columns * rows / 8)));
  if (width < 480) {
    const columns = Math.max(5, Math.floor((width - 20 + 4) / 52) - 2);
    const rows = Math.max(8, Math.floor((height - 220 + 4) / 52) - 2);
    const gridColumns = columns + 2;
    const gridRows = rows + 2;
    const preferredCellSize = Math.max(42, Math.min(52, Math.floor(Math.min(
      (width - 24) / gridColumns,
      (height - 292) / gridRows,
    ))));
    return { columns, rows, borderSize: 1, targetWordCount: wordCount(columns, rows, 5, 8), preferredCellSize };
  }
  if (width < 800) {
    const columns = Math.max(8, Math.min(12, Math.floor((width - 32 + 4) / 52) - 2));
    const rows = Math.max(10, Math.min(14, Math.floor((height - 235 + 4) / 52) - 2));
    return { columns, rows, borderSize: 1, targetWordCount: wordCount(columns, rows, 8, 12), preferredCellSize: 52 };
  }
  const columns = Math.max(14, Math.min(16, Math.floor((width - 96) / 64) - 2));
  const rows = Math.max(9, Math.min(10, Math.floor((height - 255) / 58) - 2));
  return { columns, rows, borderSize: 1, targetWordCount: wordCount(columns, rows, 12, 16), preferredCellSize: 64 };
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
  return [...words].sort((left, right) => {
    const leftDistance = Math.abs(Array.from(left).length - 6);
    const rightDistance = Math.abs(Array.from(right).length - 6);
    return leftDistance - rightDistance || hash(`${seed}:${left}`) - hash(`${seed}:${right}`);
  });
}

function wordsWithoutSubstringConflicts(words: readonly string[]): string[] {
  return words.reduce<string[]>((selected, word) => {
    if (!selected.some((other) => word.includes(other) || other.includes(word))) selected.push(word);
    return selected;
  }, []);
}

export function generateCompletePuzzle(theme: PuzzleTheme, profile: PuzzleProfile, seed: string): { puzzle: PuzzleResult; targetWords: string[] } {
  const ordered = wordsWithoutSubstringConflicts(orderedWords(theme.words, seed));
  const minimumWords = Math.min(4, ordered.length);
  let totalAttempts = 0;
  for (let count = Math.min(profile.targetWordCount, ordered.length);
    count >= minimumWords && totalAttempts < MAX_COMPLETE_PUZZLE_ATTEMPTS;
    count -= 1) {
    const targetWords = ordered.slice(0, count);
    for (let attempt = 0; attempt < ATTEMPTS_PER_WORD_COUNT && totalAttempts < MAX_COMPLETE_PUZZLE_ATTEMPTS; attempt += 1) {
      totalAttempts += 1;
      try {
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
            useBacktracking: true,
            fillPercentage: 1,
          },
        });
        if (puzzle.unplacedWords.length === 0) return { puzzle, targetWords };
      } catch (error) {
        if (!(error instanceof PuzzleGenerationError)) throw error;
      }
    }
  }
  throw new Error(`Could not place a complete word set for ${theme.title}.`);
}

export function createSession(theme: PuzzleTheme, profile: PuzzleProfile, seed = randomId()): GameSession {
  const { puzzle, targetWords } = generateCompletePuzzle(theme, profile, seed);
  return { id: randomId(), themeId: theme.id, seed, puzzle, targetWords, solvedWords: [], solvedColors: {}, lettersSelected: 0, elapsedMs: 0, status: "playing", profile };
}

export function resetSession(session: GameSession): GameSession {
  const { completedAt: _completedAt, ...current } = session;
  return {
    ...current,
    id: randomId(),
    solvedWords: [],
    solvedColors: {},
    lettersSelected: 0,
    elapsedMs: 0,
    status: "playing",
  };
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

export function formatCount(value: number): string {
  const units = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ] as const;
  for (const [index, unit] of units.entries()) {
    if (value < unit.threshold) continue;
    const scaled = value / unit.threshold;
    const rounded = scaled < 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled);
    if (rounded === 1_000 && index > 0) return `1${units[index - 1]!.suffix}`;
    return `${rounded}${unit.suffix}`;
  }
  return String(Math.round(value));
}
