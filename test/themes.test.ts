import { describe, expect, it } from "vitest";
import { calculatePuzzleProfile, generateCompletePuzzle } from "../src/app-model.js";
import { THEME_COUNTS, THEMES, selectRandomTheme } from "../src/themes.js";

describe("theme catalog", () => {
  it("contains 490 standard themes and 9 rare easter eggs", () => {
    expect(THEME_COUNTS).toEqual({ common: 490, rare: 9, total: 499 });
    expect(THEMES).toHaveLength(499);
    expect(new Set(THEMES.map(({ id }) => id)).size).toBe(499);
    expect(THEMES.some(({ id }) => id === "egg-roman")).toBe(false);
    expect(THEMES.every(({ title }) => /^\S+$/u.test(title))).toBe(true);
    const needle = THEMES.find(({ id }) => id === "egg-needle")!;
    expect(needle.words).toEqual([","]);
    expect(needle.fillCharacters).toEqual(["."]);
  });

  it("contains valid, unique content in every theme", () => {
    for (const theme of THEMES) {
      expect(theme.words.length, theme.id).toBeGreaterThanOrEqual(theme.rare ? 1 : 20);
      expect(new Set(theme.words.map((word) => word.normalize("NFC").trim().toLocaleLowerCase("und"))).size, theme.id).toBe(theme.words.length);
      expect(theme.colors.length, theme.id).toBeGreaterThanOrEqual(6);
      if (theme.fillCharacters !== undefined) {
        expect(theme.fillCharacters.length, theme.id).toBeGreaterThan(0);
        expect(new Set(theme.fillCharacters).size, theme.id).toBe(theme.fillCharacters.length);
        expect(theme.fillCharacters.every((character) => Array.from(character.normalize("NFC")).length === 1), theme.id).toBe(true);
      }
    }
  });

  it("selects standard themes normally, rare themes at the easter-egg boundary, and excludes repeats", () => {
    const standard = selectRandomTheme(new Set(), (() => { const values = [0.5, 0]; return () => values.shift()!; })())!;
    const rare = selectRandomTheme(new Set(), (() => { const values = [0.049, 0]; return () => values.shift()!; })())!;
    const boundary = selectRandomTheme(new Set(), (() => { const values = [0.05, 0]; return () => values.shift()!; })())!;
    expect(standard.rare).not.toBe(true);
    expect(rare.rare).toBe(true);
    expect(boundary.rare).not.toBe(true);
    expect(selectRandomTheme(new Set([standard.id]), () => 0.5)?.id).not.toBe(standard.id);
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

  it("generates every rare easter egg on a desktop board", () => {
    const profile = calculatePuzzleProfile(1440, 1000);
    for (const theme of THEMES.filter((candidate) => candidate.rare)) {
      const result = generateCompletePuzzle(theme, profile, `catalog-desktop:${theme.id}`);
      expect(result.puzzle.unplacedWords, theme.id).toEqual([]);
      expect(result.targetWords.length, theme.id).toBe(Math.min(profile.targetWordCount, theme.maxWords ?? Number.POSITIVE_INFINITY, theme.words.length));
      const fillCharacters = new Set(theme.fillCharacters);
      for (const cell of result.puzzle.grid.flat()) {
        if (cell.words.length === 0) expect(fillCharacters.has(cell.letter), `${theme.id}:${cell.position.x},${cell.position.y}`).toBe(true);
      }
    }
  }, 30_000);

  it("keeps classic puzzle filler limited to standard letters", () => {
    const theme = THEMES.find((candidate) => !candidate.rare)!;
    const { puzzle } = generateCompletePuzzle(theme, calculatePuzzleProfile(390, 844), "classic-fill");
    for (const cell of puzzle.grid.flat()) {
      if (cell.words.length === 0) expect(cell.letter).toMatch(/^[a-z]$/u);
    }
  });
});
