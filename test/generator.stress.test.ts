import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGURATION, Direction, generatePuzzle, type PuzzleResult } from "../src/index.js";

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

function hasUnexpectedOccurrence(puzzle: PuzzleResult, word: string, canonicalPath: readonly { readonly x: number; readonly y: number }[], directions: readonly string[]): boolean {
  const characters = Array.from(word);
  const canonicalCells = canonicalPath.map(({ x, y }) => `${x},${y}`).sort().join("|");
  for (let startY = 0; startY < puzzle.size.height; startY += 1) {
    for (let startX = 0; startX < puzzle.size.width; startX += 1) {
      if (puzzle.grid[startY]?.[startX]?.letter !== characters[0]) continue;
      const visited = new Set([`${startX},${startY}`]);
      const path = [`${startX},${startY}`];
      const search = (x: number, y: number, characterIndex: number): boolean => {
        if (characterIndex === characters.length) return [...path].sort().join("|") !== canonicalCells;
        for (const direction of directions) {
          const [deltaX, deltaY] = DIRECTION_DELTAS[direction]!;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          const positionKey = `${nextX},${nextY}`;
          const cell = puzzle.grid[nextY]?.[nextX];
          if (visited.has(positionKey) || cell?.letter !== characters[characterIndex]) continue;
          visited.add(positionKey);
          path.push(positionKey);
          if (search(nextX, nextY, characterIndex + 1)) return true;
          path.pop();
          visited.delete(positionKey);
        }
        return false;
      };
      if (search(startX, startY, 1)) return true;
    }
  }
  return false;
}

describe("generator stress coverage", () => {
  it("generates and solves 1,000 unique boards", { timeout: 60_000 }, () => {
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
        expect(hasUnexpectedOccurrence(result, entry.word, entry.path, DEFAULT_CONFIGURATION.allowedDirections), `seed ${seed}: grid contains another solvable occurrence of “${entry.word}”`).toBe(false);
      }
    }
    expect(boardSignatures.size).toBe(1_000);
  });
});
