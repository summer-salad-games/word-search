import { describe, expect, it } from "vitest";
import { calculatePuzzleProfile, extendSelection, generateCompletePuzzle, pathsMatch } from "../src/app-model.js";
import { THEMES } from "../src/themes.js";

describe("application model", () => {
  it("chooses fewer words and a smaller grid for a phone", () => {
    const phone = calculatePuzzleProfile(390, 844);
    const desktop = calculatePuzzleProfile(1440, 1000);
    expect(phone.columns).toBeLessThan(desktop.columns);
    expect(phone.rows).toBeLessThanOrEqual(desktop.rows);
    expect(phone.targetWordCount).toBeLessThan(desktop.targetWordCount);
  });

  it("only returns a puzzle after every listed target was placed", () => {
    const profile = calculatePuzzleProfile(390, 844);
    const result = generateCompletePuzzle(THEMES[0]!, profile, "phone-test");
    expect(result.targetWords).toHaveLength(profile.targetWordCount);
    expect(result.puzzle.unplacedWords).toEqual([]);
    expect(new Set(result.puzzle.entries.map((entry) => entry.word))).toEqual(new Set(result.targetWords));
  });

  it("extends, rejects, and backtracks an orthogonal selection", () => {
    let path = extendSelection([], { x: 1, y: 1 });
    path = extendSelection(path, { x: 2, y: 1 });
    expect(extendSelection(path, { x: 3, y: 2 })).toEqual(path);
    expect(extendSelection(path, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
    expect(extendSelection(path, { x: 2, y: 2 })).toEqual([...path, { x: 2, y: 2 }]);
  });

  it("accepts a solution path from either end", () => {
    const expected = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
    expect(pathsMatch(expected, expected)).toBe(true);
    expect(pathsMatch([...expected].reverse(), expected)).toBe(true);
    expect(pathsMatch(expected.slice(0, 2), expected)).toBe(false);
  });
});
