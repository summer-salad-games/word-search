import { describe, expect, it } from "vitest";
import { calculatePuzzleProfile, generateCompletePuzzle } from "../src/app-model.js";
import { THEMES, selectRandomTheme } from "../src/themes.js";

describe("theme catalog", () => {
  it("contains 500 ordinary themes", () => {
    expect(THEMES).toHaveLength(500);
    expect(new Set(THEMES.map(({ id }) => id)).size).toBe(500);
    expect(THEMES.every(({ title }) => /^\S+$/u.test(title))).toBe(true);
    expect(THEMES.some(({ id }) => id === "nature-journey")).toBe(true);
  });

  it("contains valid, unique content in every theme", () => {
    for (const theme of THEMES) {
      expect(theme.words.length, theme.id).toBeGreaterThanOrEqual(20);
      expect(new Set(theme.words.map((word) => word.normalize("NFC").trim().toLocaleLowerCase("und"))).size, theme.id).toBe(theme.words.length);
      expect(theme.colors.length, theme.id).toBeGreaterThanOrEqual(6);
    }
  });

  it("selects uniformly from available themes and excludes repeats", () => {
    expect(selectRandomTheme(new Set(), () => 0)).toBe(THEMES[0]);
    expect(selectRandomTheme(new Set(), () => 0.999_999)).toBe(THEMES.at(-1));
    const selected = selectRandomTheme(new Set(), () => 0.5)!;
    expect(selectRandomTheme(new Set([selected.id]), () => 0.5)?.id).not.toBe(selected.id);
  });

  it("never repeats completed themes and reports when the collection is exhausted", () => {
    const last = THEMES.at(-1)!;
    const allButLast = new Set(THEMES.slice(0, -1).map(({ id }) => id));
    expect(selectRandomTheme(allButLast, () => 0.5)).toBe(last);
    expect(selectRandomTheme(new Set(THEMES.map(({ id }) => id)), () => 0.5)).toBeUndefined();
  });

  it("generates every catalog theme on a mobile board", () => {
    const profile = calculatePuzzleProfile(390, 844);
    for (const theme of THEMES) {
      const result = generateCompletePuzzle(theme, profile, `catalog-mobile:${theme.id}`);
      expect(result.puzzle.unplacedWords, theme.id).toEqual([]);
      expect(result.targetWords.length, theme.id).toBeGreaterThanOrEqual(Math.min(4, theme.words.length));
    }
  }, 30_000);

  it("keeps puzzle filler limited to standard letters", () => {
    const theme = THEMES[0]!;
    const { puzzle } = generateCompletePuzzle(theme, calculatePuzzleProfile(390, 844), "classic-fill");
    for (const cell of puzzle.grid.flat()) {
      if (cell.words.length === 0) expect(cell.letter).toMatch(/^[a-z]$/u);
    }
  });
});
