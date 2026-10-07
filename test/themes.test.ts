import { describe, expect, it } from "vitest";
import { calculatePuzzleProfile, generateCompletePuzzle } from "../src/app-model.js";
import { THEME_COUNTS, THEMES, selectRandomTheme } from "../src/themes.js";

describe("theme catalog", () => {
  it("contains 490 standard themes and 10 rare easter eggs", () => {
    expect(THEME_COUNTS).toEqual({ common: 490, rare: 10, total: 500 });
    expect(THEMES).toHaveLength(500);
    expect(new Set(THEMES.map(({ id }) => id)).size).toBe(500);
    expect(THEMES.every(({ title }) => /^\S+$/u.test(title))).toBe(true);
  });

  it("contains valid, unique content in every theme", () => {
    for (const theme of THEMES) {
      expect(theme.words.length, theme.id).toBeGreaterThanOrEqual(20);
      expect(new Set(theme.words.map((word) => word.normalize("NFC").trim().toLocaleLowerCase("und"))).size, theme.id).toBe(theme.words.length);
      expect(theme.colors.length, theme.id).toBeGreaterThanOrEqual(6);
    }
  });

  it("selects standard themes normally, rare themes at the easter-egg boundary, and excludes repeats", () => {
    const standard = selectRandomTheme(new Set(), (() => { const values = [0.5, 0]; return () => values.shift()!; })())!;
    const rare = selectRandomTheme(new Set(), (() => { const values = [0.019, 0]; return () => values.shift()!; })())!;
    expect(standard.rare).not.toBe(true);
    expect(rare.rare).toBe(true);
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
      expect(result.targetWords.length, theme.id).toBeGreaterThanOrEqual(4);
    }
  }, 30_000);

  it("generates every rare easter egg on a desktop board", () => {
    const profile = calculatePuzzleProfile(1440, 1000);
    for (const theme of THEMES.filter((candidate) => candidate.rare)) {
      const result = generateCompletePuzzle(theme, profile, `catalog-desktop:${theme.id}`);
      expect(result.puzzle.unplacedWords, theme.id).toEqual([]);
      expect(result.targetWords.length, theme.id).toBe(profile.targetWordCount);
    }
  }, 30_000);
});
