import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIGURATION,
  Direction,
  generatePuzzle,
  PuzzleGenerationError,
  PuzzleValidationError,
  type PuzzleResult,
} from "../src/index.js";

const NATURE_WORDS = [
  "sun", "sky", "bee", "oak", "fog", "sea", "ant", "ice", "bug", "mud",
  "rain", "tree", "wind", "leaf", "rock", "pine", "lily", "pond", "bird", "moss",
  "cloud", "plant", "earth", "creek", "grass", "tulip", "beach", "flora", "fungi", "delta",
  "forest", "canyon", "valley", "desert", "sunset", "meadow", "rapids", "garden", "stream", "flower",
] as const;

const DIRECTION_DELTAS: Readonly<Record<string, readonly [number, number]>> = {
  [Direction.up]: [0, -1], [Direction.upRight]: [1, -1],
  [Direction.right]: [1, 0], [Direction.downRight]: [1, 1],
  [Direction.down]: [0, 1], [Direction.downLeft]: [-1, 1],
  [Direction.left]: [-1, 0], [Direction.upLeft]: [-1, -1],
};

function hasFillerCreatedOccurrence(
  puzzle: PuzzleResult,
  word: string,
  directions: readonly string[],
): boolean {
  const characters = Array.from(word);

  for (let startY = 0; startY < puzzle.size.height; startY += 1) {
    for (let startX = 0; startX < puzzle.size.width; startX += 1) {
      const startCell = puzzle.grid[startY]?.[startX];
      if (startCell?.letter !== characters[0]) continue;
      const visited = new Set([`${startX},${startY}`]);

      const search = (x: number, y: number, characterIndex: number, usesFiller: boolean): boolean => {
        if (characterIndex === characters.length) return usesFiller;

        for (const direction of directions) {
          const [deltaX, deltaY] = DIRECTION_DELTAS[direction]!;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          const positionKey = `${nextX},${nextY}`;
          const cell = puzzle.grid[nextY]?.[nextX];
          if (visited.has(positionKey) || cell?.letter !== characters[characterIndex]) continue;
          visited.add(positionKey);
          if (search(nextX, nextY, characterIndex + 1, usesFiller || cell.words.length === 0)) return true;
          visited.delete(positionKey);
        }
        return false;
      };

      if (search(startX, startY, 1, startCell.words.length === 0)) return true;
    }
  }
  return false;
}

describe("generatePuzzle", () => {
  it("is repeatable with a seed and returns the full grid", () => {
    const input = { words: ["sun", "tree", "cloud", "forest"], seed: "nature" } as const;
    const first = generatePuzzle(input);
    const second = generatePuzzle(input);
    expect(first).toEqual(second);
    expect(first.size).toEqual({ width: 17, height: 19 });
    expect(first.grid).toHaveLength(19);
    expect(first.grid[0]).toHaveLength(17);
  });

  it("places each entry along adjacent cells containing its Unicode code points", () => {
    const result = generatePuzzle({
      words: ["café", "🌳tree", "moss"],
      seed: 42,
      configuration: { fillPercentage: 1 },
    });
    expect(result.unplacedWords).toEqual([]);
    for (const entry of result.entries) {
      expect(entry.path).toHaveLength(Array.from(entry.word).length);
      entry.path.forEach((position, index) => {
        expect(result.grid[position.y]?.[position.x]?.letter).toBe(Array.from(entry.word)[index]);
      });
      entry.directions.forEach((direction, index) => {
        const from = entry.path[index]!;
        const to = entry.path[index + 1]!;
        expect([to.x - from.x, to.y - from.y]).toEqual(DIRECTION_DELTAS[direction]);
      });
    }
  });

  it("generates and solves 1,000 unique boards", { timeout: 30_000 }, () => {
    const boardSignatures = new Set<string>();

    for (let seed = 0; seed < 1_000; seed += 1) {
      const result = generatePuzzle({ words: NATURE_WORDS, seed });
      const signature = result.grid.map((row) => row.map((cell) => cell.letter).join("")).join("\n");
      expect(boardSignatures.has(signature), `seed ${seed} produced a duplicate board`).toBe(false);
      boardSignatures.add(signature);

      expect(result.entries.length + result.unplacedWords.length).toBe(NATURE_WORDS.length);
      for (const entry of result.entries) {
        expect(entry.path).toHaveLength(Array.from(entry.word).length);
        expect(entry.directions).toHaveLength(entry.path.length - 1);

        let position = entry.path[0]!;
        let solvedWord = result.grid[position.y]?.[position.x]?.letter ?? "";
        for (let index = 0; index < entry.directions.length; index += 1) {
          const [deltaX, deltaY] = DIRECTION_DELTAS[entry.directions[index]!]!;
          position = { x: position.x + deltaX, y: position.y + deltaY };
          expect(position).toEqual(entry.path[index + 1]);
          solvedWord += result.grid[position.y]?.[position.x]?.letter ?? "";
        }
        expect(solvedWord).toBe(entry.word);
        expect(
          hasFillerCreatedOccurrence(result, entry.word, DEFAULT_CONFIGURATION.allowedDirections),
          `seed ${seed}: filler created another solvable occurrence of “${entry.word}”`,
        ).toBe(false);
      }
    }

    expect(boardSignatures.size).toBe(1_000);
  });

  it("reports canonical paths and directions for reversed words", () => {
    const result = generatePuzzle({
      words: ["tree"],
      random: () => 0,
      configuration: {
        gridSize: { width: 4, height: 1 }, borderSize: 0, fillPercentage: 1,
        reverseWordProbability: 1, allowedDirections: [Direction.right],
      },
    });
    expect(result.entries[0]?.reversed).toBe(true);
    expect(result.entries[0]?.displayedWord).toBe("eert");
    expect(result.entries[0]?.directions).toEqual([
      Direction.left, Direction.left, Direction.left,
    ]);
    expect(result.entries[0]?.path.map(({ x, y }) => result.grid[y]?.[x]?.letter).join("")).toBe("tree");
  });

  it("reports words that cannot fit", () => {
    const result = generatePuzzle({
      words: ["impossible"],
      seed: 1,
      configuration: {
        gridSize: { width: 1, height: 1 },
        borderSize: 0,
        useBorder: false,
        fillPercentage: 1,
      },
    });
    expect(result.entries).toEqual([]);
    expect(result.unplacedWords).toEqual(["impossible"]);
  });

  it("prevents filler cells from creating duplicate target words", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const result = generatePuzzle({
        words: ["aa"],
        seed,
        configuration: {
          gridSize: { width: 8, height: 1 },
          borderSize: 0,
          fillPercentage: 0.125,
          reverseWordProbability: 0,
          allowedDirections: [Direction.right, Direction.left],
          fillLetters: ["a", "b"],
          restrictedFillLetters: [],
        },
      });
      expect(result.entries).toHaveLength(1);
      for (let x = 0; x < result.size.width - 1; x += 1) {
        const pair = [result.grid[0]?.[x], result.grid[0]?.[x + 1]];
        if (pair.every((cell) => cell?.letter === "a")) {
          expect(pair.every((cell) => cell?.words.includes("aa"))).toBe(true);
        }
      }
    }
  });

  it("fails clearly when the filler alphabet makes uniqueness impossible", () => {
    expect(() => generatePuzzle({
      words: ["a"],
      seed: 1,
      configuration: {
        gridSize: { width: 2, height: 1 },
        borderSize: 0,
        fillPercentage: 0.5,
        fillLetters: ["a"],
        restrictedFillLetters: [],
      },
    })).toThrow(PuzzleGenerationError);
  });

  it("does not mutate input", () => {
    const words = [" Alpha ", "Beta"];
    const directions = [Direction.right, Direction.down];
    generatePuzzle({ words, seed: 7, configuration: { allowedDirections: directions } });
    expect(words).toEqual([" Alpha ", "Beta"]);
    expect(directions).toEqual([Direction.right, Direction.down]);
  });

  it("rejects invalid and ambiguous input", () => {
    expect(() => generatePuzzle({ words: [" "] })).toThrow(PuzzleValidationError);
    expect(() => generatePuzzle({ words: ["Tree", " tree "] })).toThrow(/Duplicate word/);
    expect(() => generatePuzzle({ words: ["tree"], seed: 1, random: Math.random })).toThrow(/either seed or random/);
    expect(() => generatePuzzle({ words: ["tree"], configuration: { fillPercentage: 2 } })).toThrow(/fillPercentage/);
    expect(() => generatePuzzle({ words: ["tree"], configuration: { useBorder: 1 as never } })).toThrow(/useBorder/);
  });
});
