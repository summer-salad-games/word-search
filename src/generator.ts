import { DEFAULT_CONFIGURATION } from "./configuration.js";
import { ALL_DIRECTIONS, directionVector, isDiagonal, oppositeDirection } from "./directions.js";
import { PuzzleGenerationError, PuzzleValidationError } from "./errors.js";
import { createRandom, randomIndex, shuffled, type RandomSource } from "./random.js";
import {
  type Direction,
  type PlacedWord,
  type Position,
  type PuzzleCell,
  type PuzzleConfiguration,
  type PuzzleInput,
  type PuzzleResult,
} from "./types.js";

interface MutableCell {
  letter: string;
  readonly words: string[];
}

interface PathResult {
  readonly path: Position[];
  readonly directions: Direction[];
}

interface UnexpectedOccurrence {
  readonly path: readonly Position[];
  readonly word: string;
}

const keyOf = ({ x, y }: Position): string => `${x},${y}`;
const pathCellSetKey = (path: readonly Position[]): string => path.map(keyOf).sort().join("|");
const edgeKey = (a: Position, b: Position): string => {
  const first = keyOf(a);
  const second = keyOf(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
};

function singleCodePoint(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new PuzzleValidationError(`${field} entries must be strings.`);
  }
  const normalized = value.normalize("NFC");
  const characters = Array.from(normalized);
  if (characters.length !== 1) {
    throw new PuzzleValidationError(`${field} entries must each contain exactly one Unicode code point.`);
  }
  return characters[0]!;
}

function probability(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new PuzzleValidationError(`${field} must be a finite number between 0 and 1.`);
  }
  return value;
}

function positiveInteger(value: number, field: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new PuzzleValidationError(`${field} must be ${allowZero ? "a non-negative" : "a positive"} integer.`);
  }
  return value;
}

function resolveConfiguration(input: PuzzleInput["configuration"]): PuzzleConfiguration {
  if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) {
    throw new PuzzleValidationError("configuration must be an object when provided.");
  }
  if (input?.gridSize !== undefined &&
      (input.gridSize === null || typeof input.gridSize !== "object" || Array.isArray(input.gridSize))) {
    throw new PuzzleValidationError("gridSize must be an object when provided.");
  }
  const arrayFields = ["allowedDirections", "fillLetters", "restrictedFillLetters"] as const;
  for (const field of arrayFields) {
    if (input?.[field] !== undefined && !Array.isArray(input[field])) {
      throw new PuzzleValidationError(`${field} must be an array.`);
    }
  }
  const configuration: PuzzleConfiguration = {
    ...DEFAULT_CONFIGURATION,
    ...input,
    gridSize: { ...DEFAULT_CONFIGURATION.gridSize, ...input?.gridSize },
    allowedDirections: [...(input?.allowedDirections ?? DEFAULT_CONFIGURATION.allowedDirections)],
    restrictedFillLetters: [...(input?.restrictedFillLetters ?? DEFAULT_CONFIGURATION.restrictedFillLetters)],
    fillLetters: [...(input?.fillLetters ?? DEFAULT_CONFIGURATION.fillLetters)],
  };

  positiveInteger(configuration.gridSize.width, "gridSize.width");
  positiveInteger(configuration.gridSize.height, "gridSize.height");
  positiveInteger(configuration.borderSize, "borderSize", true);
  probability(configuration.straightness, "straightness");
  probability(configuration.reverseWordProbability, "reverseWordProbability");
  probability(configuration.fillPercentage, "fillPercentage");
  const booleanFields = [
    "useBorder",
    "wordsOverlap",
    "selfIntersect",
    "wordsIntersect",
    "useBacktracking",
    "useSmallerWordFallback",
    "fillBorder",
  ] as const;
  for (const field of booleanFields) {
    if (typeof configuration[field] !== "boolean") {
      throw new PuzzleValidationError(`${field} must be a boolean.`);
    }
  }
  if (configuration.allowedDirections.length === 0) {
    throw new PuzzleValidationError("allowedDirections must contain at least one direction.");
  }
  const knownDirections = new Set<Direction>(ALL_DIRECTIONS);
  const directionSet = new Set<Direction>();
  for (const direction of configuration.allowedDirections) {
    if (!knownDirections.has(direction)) {
      throw new PuzzleValidationError(`Unknown direction: ${String(direction)}.`);
    }
    if (directionSet.has(direction)) {
      throw new PuzzleValidationError(`allowedDirections contains a duplicate: ${direction}.`);
    }
    directionSet.add(direction);
  }

  const fillLetters = configuration.fillLetters.map((letter) => singleCodePoint(letter, "fillLetters"));
  if (new Set(fillLetters).size !== fillLetters.length) {
    throw new PuzzleValidationError("fillLetters must not contain duplicates.");
  }
  const restrictedLetters = configuration.restrictedFillLetters.map(
    (letter) => singleCodePoint(letter, "restrictedFillLetters"),
  );
  if (new Set(restrictedLetters).size !== restrictedLetters.length) {
    throw new PuzzleValidationError("restrictedFillLetters must not contain duplicates.");
  }
  const restricted = new Set(restrictedLetters);
  const usableFillLetters = fillLetters.filter((letter) => !restricted.has(letter));
  if (usableFillLetters.length === 0) {
    throw new PuzzleValidationError("At least one fill letter must remain after restrictions are applied.");
  }
  return { ...configuration, fillLetters, restrictedFillLetters: [...restricted] };
}

function normalizeWords(words: readonly string[]): string[] {
  if (!Array.isArray(words) || words.length === 0) {
    throw new PuzzleValidationError("words must contain at least one word.");
  }
  const normalized = words.map((word, index) => {
    if (typeof word !== "string") {
      throw new PuzzleValidationError(`words[${index}] must be a string.`);
    }
    const result = word.trim().normalize("NFC").toLowerCase();
    if (result.length === 0) {
      throw new PuzzleValidationError(`words[${index}] must not be empty.`);
    }
    if (Array.from(result).length > 256) {
      throw new PuzzleValidationError(`words[${index}] must not exceed 256 Unicode code points.`);
    }
    return result;
  });
  const seen = new Set<string>();
  for (const word of normalized) {
    if (seen.has(word)) {
      throw new PuzzleValidationError(`Duplicate word after normalization: ${word}.`);
    }
    seen.add(word);
  }
  return normalized;
}

function candidateStarts(configuration: PuzzleConfiguration, random: RandomSource): Position[] {
  const { width, height } = configuration.gridSize;
  const starts: Position[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      starts.push({ x: x + configuration.borderSize, y: y + configuration.borderSize });
    }
  }
  const desired = Math.round(starts.length * configuration.fillPercentage);
  if (desired === 0) return [];
  if (desired === 1) {
    return [{
      x: configuration.borderSize + Math.floor(width / 2),
      y: configuration.borderSize + Math.floor(height / 2),
    }];
  }
  const skip = Math.max(1, Math.floor(starts.length / desired));
  const attemptCount = Math.ceil(starts.length / skip);
  return shuffled(starts, random).slice(0, attemptCount);
}

function findUnexpectedOccurrence(
  grid: readonly (readonly MutableCell[])[],
  entries: readonly PlacedWord[],
  directions: readonly Direction[],
): UnexpectedOccurrence | undefined {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;

  for (const entry of entries) {
    const characters = Array.from(entry.word);
    const canonicalPathKey = pathCellSetKey(entry.path);
    for (let startY = 0; startY < height; startY += 1) {
      for (let startX = 0; startX < width; startX += 1) {
        if (grid[startY]?.[startX]?.letter !== characters[0]) continue;
        const start = { x: startX, y: startY };
        const path: Position[] = [start];
        const visited = new Set([keyOf(start)]);

        const search = (characterIndex: number): Position[] | undefined => {
          if (characterIndex === characters.length) {
            return pathCellSetKey(path) === canonicalPathKey ? undefined : [...path];
          }
          const previous = path[path.length - 1]!;
          for (const direction of directions) {
            const vector = directionVector(direction);
            const next = { x: previous.x + vector.x, y: previous.y + vector.y };
            const nextKey = keyOf(next);
            if (visited.has(nextKey) || grid[next.y]?.[next.x]?.letter !== characters[characterIndex]) continue;
            path.push(next);
            visited.add(nextKey);
            const result = search(characterIndex + 1);
            if (result !== undefined) return result;
            visited.delete(nextKey);
            path.pop();
          }
          return undefined;
        };

        const result = search(1);
        if (result !== undefined) return { path: result, word: entry.word };
      }
    }
  }
  return undefined;
}

function fillWithoutAccidentalWords(
  grid: MutableCell[][],
  entries: readonly PlacedWord[],
  configuration: PuzzleConfiguration,
  fillLetters: readonly string[],
  random: RandomSource,
): void {
  const border = configuration.borderSize;
  const fullHeight = grid.length;
  const fullWidth = grid[0]?.length ?? 0;
  const fillerPositions = new Set<string>();

  for (let y = 0; y < fullHeight; y += 1) {
    for (let x = 0; x < fullWidth; x += 1) {
      const isBorder = x < border || y < border || x >= fullWidth - border || y >= fullHeight - border;
      const cell = grid[y]![x]!;
      if (cell.letter === "" && (configuration.fillBorder || !isBorder)) {
        cell.letter = fillLetters[randomIndex(fillLetters.length, random)]!;
        fillerPositions.add(keyOf({ x, y }));
      }
    }
  }

  if (entries.length === 0 || fillerPositions.size === 0) return;
  const solveDirections = configuration.allowedDirections;
  const maxRepairs = Math.max(1_000, fillerPositions.size * fillLetters.length * 10);

  for (let repair = 0; repair < maxRepairs; repair += 1) {
    const occurrence = findUnexpectedOccurrence(grid, entries, solveDirections);
    if (occurrence === undefined) return;
    const repairablePositions = occurrence.path.filter((position) => fillerPositions.has(keyOf(position)));
    if (repairablePositions.length === 0) {
      throw new PuzzleGenerationError(
        `Word placement created more than one solution for “${occurrence.word}”.`,
      );
    }
    const position = repairablePositions[randomIndex(repairablePositions.length, random)]!;
    const cell = grid[position.y]![position.x]!;
    const alternatives = shuffled(fillLetters.filter((letter) => letter !== cell.letter), random);
    if (alternatives.length === 0) {
      throw new PuzzleGenerationError(
        `Cannot prevent an accidental occurrence of “${occurrence.word}” with the configured fill letters.`,
      );
    }
    cell.letter = alternatives[0]!;
  }

  throw new PuzzleGenerationError("Could not fill the grid without creating duplicate target words.");
}

function freezeResult(
  grid: MutableCell[][],
  configuration: PuzzleConfiguration,
  entries: PlacedWord[],
  unplacedWords: string[],
  theme: string | undefined,
): PuzzleResult {
  const border = configuration.borderSize;
  const fullHeight = configuration.gridSize.height + border * 2;
  const fullWidth = configuration.gridSize.width + border * 2;
  const cells: PuzzleCell[][] = grid.map((row, y) =>
    row.map((cell, x) =>
      Object.freeze({
        position: Object.freeze({ x, y }),
        letter: cell.letter,
        words: Object.freeze([...cell.words]),
        isBorder: x < border || y < border || x >= fullWidth - border || y >= fullHeight - border,
      }),
    ),
  );
  const result: PuzzleResult = {
    grid: Object.freeze(cells.map((row) => Object.freeze(row))),
    size: Object.freeze({ width: fullWidth, height: fullHeight }),
    playableSize: Object.freeze({ ...configuration.gridSize }),
    borderSize: border,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    unplacedWords: Object.freeze([...unplacedWords]),
    ...(theme === undefined ? {} : { theme }),
  };
  return Object.freeze(result);
}

/** Generates a complete puzzle synchronously without mutating its input. */
export function generatePuzzle(input: PuzzleInput): PuzzleResult {
  if (input === null || typeof input !== "object") {
    throw new PuzzleValidationError("input must be an object.");
  }
  if (input.theme !== undefined && typeof input.theme !== "string") {
    throw new PuzzleValidationError("theme must be a string when provided.");
  }
  const configuration = resolveConfiguration(input.configuration);
  const words = normalizeWords(input.words);
  const random = createRandom(input.seed, input.random);
  const border = configuration.borderSize;
  const fullWidth = configuration.gridSize.width + border * 2;
  const fullHeight = configuration.gridSize.height + border * 2;
  if (!Number.isSafeInteger(fullWidth) || !Number.isSafeInteger(fullHeight) ||
      fullWidth > 512 || fullHeight > 512 || fullWidth * fullHeight > 262_144) {
    throw new PuzzleValidationError(
      "The full grid must not exceed 512 cells per dimension or 262,144 total cells.",
    );
  }
  const grid: MutableCell[][] = Array.from({ length: fullHeight }, () =>
    Array.from({ length: fullWidth }, () => ({ letter: "", words: [] })),
  );
  const entries: PlacedWord[] = [];
  const remaining = new Set(words);
  const globalEdges = new Set<string>();

  const inPlacementBounds = ({ x, y }: Position): boolean => {
    if (configuration.useBorder) return x >= 0 && y >= 0 && x < fullWidth && y < fullHeight;
    return x >= border && y >= border && x < fullWidth - border && y < fullHeight - border;
  };

  const findPath = (
    characters: readonly string[],
    start: Position,
    placementDirections: readonly Direction[],
    acceptPath: (path: PathResult) => boolean,
  ): PathResult | undefined => {
    const path: Position[] = [start];
    const directions: Direction[] = [];
    const occupied = new Set([keyOf(start)]);
    const localEdges = new Set<string>();
    let searchSteps = 0;
    const maxSearchSteps = Math.max(1_000, characters.length * placementDirections.length * 250);

    const available = (position: Position, letter: string): boolean => {
      if (!inPlacementBounds(position) || occupied.has(keyOf(position))) return false;
      const cell = grid[position.y]?.[position.x];
      return cell !== undefined && (cell.letter === "" || (configuration.wordsOverlap && cell.letter === letter));
    };

    const visit = (characterIndex: number): boolean => {
      if (characterIndex === characters.length) return acceptPath({ path, directions });
      if (searchSteps >= maxSearchSteps) return false;
      searchSteps += 1;
      const previous = path[path.length - 1]!;
      let choices = shuffled(placementDirections, random);
      const lastDirection = directions[directions.length - 1];
      if (lastDirection !== undefined && random() < configuration.straightness) {
        choices = [lastDirection, ...choices.filter((direction) => direction !== lastDirection)];
      }

      for (const direction of choices) {
        const vector = directionVector(direction);
        const next = { x: previous.x + vector.x, y: previous.y + vector.y };
        if (!available(next, characters[characterIndex]!)) continue;
        const currentEdge = edgeKey(previous, next);
        if (isDiagonal(direction)) {
          const crossing = edgeKey(
            { x: previous.x, y: next.y },
            { x: next.x, y: previous.y },
          );
          if ((!configuration.selfIntersect && localEdges.has(crossing)) ||
              (!configuration.wordsIntersect && globalEdges.has(crossing))) continue;
        }
        path.push(next);
        directions.push(direction);
        occupied.add(keyOf(next));
        localEdges.add(currentEdge);
        const complete = configuration.useBacktracking
          ? visit(characterIndex + 1)
          : characterIndex + 1 === characters.length || visit(characterIndex + 1);
        if (complete) return true;
        localEdges.delete(currentEdge);
        occupied.delete(keyOf(next));
        directions.pop();
        path.pop();
        if (!configuration.useBacktracking) return false;
      }
      return false;
    };

    const firstCell = grid[start.y]?.[start.x];
    if (firstCell === undefined ||
        (firstCell.letter !== "" && (!configuration.wordsOverlap || firstCell.letter !== characters[0]))) {
      return undefined;
    }
    return visit(1) ? { path, directions } : undefined;
  };

  const buildEntry = (
    word: string,
    displayedCharacters: readonly string[],
    reversed: boolean,
    pathResult: PathResult,
  ): PlacedWord => {
    const canonicalPath = reversed ? [...pathResult.path].reverse() : [...pathResult.path];
    const canonicalDirections = canonicalPath.slice(1).map((to, index) => {
      const from = canonicalPath[index]!;
      const result = ALL_DIRECTIONS.find((direction) => {
        const vector = directionVector(direction);
        return from.x + vector.x === to.x && from.y + vector.y === to.y;
      });
      if (result === undefined) throw new Error("Internal error: non-adjacent word path.");
      return result;
    });
    return {
      word,
      displayedWord: displayedCharacters.join(""),
      reversed,
      path: Object.freeze(canonicalPath.map((position) => Object.freeze({ ...position }))),
      directions: Object.freeze(canonicalDirections),
    };
  };

  const applyWord = (word: string, characters: readonly string[], path: readonly Position[]): void => {
    path.forEach((position, index) => {
      const cell = grid[position.y]![position.x]!;
      cell.letter = characters[index]!;
      cell.words.push(word);
    });
  };

  const removeWord = (word: string, path: readonly Position[]): void => {
    for (const position of path) {
      const cell = grid[position.y]![position.x]!;
      const wordIndex = cell.words.lastIndexOf(word);
      if (wordIndex >= 0) cell.words.splice(wordIndex, 1);
      if (cell.words.length === 0) cell.letter = "";
    }
  };

  for (const start of candidateStarts(configuration, random)) {
    if (remaining.size === 0) break;
    const randomizedWords = shuffled([...remaining], random);
    const primary = randomizedWords[0]!;
    const primaryLength = Array.from(primary).length;
    const candidates = configuration.useSmallerWordFallback
      ? [primary, ...randomizedWords.slice(1).filter((word) => Array.from(word).length < primaryLength)]
      : [primary];
    for (const word of candidates) {
      const reversed = random() < configuration.reverseWordProbability;
      const originalCharacters = Array.from(word);
      const displayedCharacters = reversed ? [...originalCharacters].reverse() : originalCharacters;
      const placementDirections = reversed
        ? configuration.allowedDirections.map(oppositeDirection)
        : configuration.allowedDirections;
      const pathResult = findPath(displayedCharacters, start, placementDirections, (candidatePath) => {
        const candidateEntry = buildEntry(word, displayedCharacters, reversed, candidatePath);
        applyWord(word, displayedCharacters, candidatePath.path);
        const ambiguous = findUnexpectedOccurrence(
          grid,
          [...entries, candidateEntry],
          configuration.allowedDirections,
        ) !== undefined;
        removeWord(word, candidatePath.path);
        return !ambiguous;
      });
      if (pathResult === undefined) continue;
      applyWord(word, displayedCharacters, pathResult.path);
      for (let index = 0; index < pathResult.path.length; index += 1) {
        const position = pathResult.path[index]!;
        if (index > 0) globalEdges.add(edgeKey(pathResult.path[index - 1]!, position));
      }
      entries.push(buildEntry(word, displayedCharacters, reversed, pathResult));
      remaining.delete(word);
      break;
    }
  }

  const restricted = new Set(configuration.restrictedFillLetters);
  const fillLetters = configuration.fillLetters.filter((letter) => !restricted.has(letter));
  fillWithoutAccidentalWords(grid, entries, configuration, fillLetters, random);

  return freezeResult(grid, configuration, shuffled(entries, random), words.filter((word) => remaining.has(word)), input.theme);
}
