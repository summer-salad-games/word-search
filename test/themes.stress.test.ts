import { describe, expect, it } from "vitest";
import { calculatePuzzleProfile, generateCompletePuzzle } from "../src/app-model.js";
import { THEMES } from "../src/themes.js";

describe("theme catalog stress coverage", () => {
  it("generates every catalog theme on a desktop board", { timeout: 30_000 }, () => {
    const profile = calculatePuzzleProfile(1440, 1000);
    for (const theme of THEMES) {
      const result = generateCompletePuzzle(theme, profile, `catalog-desktop:${theme.id}`);
      expect(result.puzzle.unplacedWords, theme.id).toEqual([]);
      expect(result.targetWords.length, theme.id).toBeGreaterThanOrEqual(4);
      expect(result.puzzle.grid.flat().every((cell) => /^[a-z]$/u.test(cell.letter)), theme.id).toBe(true);
    }
  });
});
