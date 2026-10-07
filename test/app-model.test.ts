import { describe, expect, it } from "vitest";
import { calculatePuzzleProfile, createSession, extendSelection, generateCompletePuzzle, gameReducer, pathsMatch, resetSession } from "../src/app-model.js";
import { THEMES } from "../src/themes.js";

describe("application model", () => {
  it("chooses fewer words and a smaller grid for a phone", () => {
    const phone = calculatePuzzleProfile(390, 844);
    const desktop = calculatePuzzleProfile(1440, 1000);
    expect(phone.columns).toBeLessThan(desktop.columns);
    expect(phone.targetWordCount).toBeLessThan(desktop.targetWordCount);
    expect(phone.rows).toBeGreaterThan(phone.columns);
    expect(desktop.columns).toBeGreaterThan(desktop.rows);
  });

  it("only returns a puzzle after every listed target was placed", () => {
    const profile = calculatePuzzleProfile(390, 844);
    const result = generateCompletePuzzle(THEMES[0]!, profile, "phone-test");
    expect(result.targetWords).toHaveLength(profile.targetWordCount);
    expect(result.puzzle.unplacedWords).toEqual([]);
    expect(new Set(result.puzzle.entries.map((entry) => entry.word))).toEqual(new Set(result.targetWords));
  });

  it("keeps word density and horizontal distribution balanced", () => {
    for (const [width, height] of [[440, 956], [1440, 1000]] as const) {
      const profile = calculatePuzzleProfile(width, height);
      let occupied = 0;
      let cells = 0;
      let left = 0;
      let right = 0;
      for (let seed = 0; seed < 100; seed += 1) {
        const { puzzle } = generateCompletePuzzle(THEMES[seed % THEMES.length]!, profile, `distribution-${width}-${seed}`);
        cells += puzzle.size.width * puzzle.size.height;
        for (const { path } of puzzle.entries) for (const position of path) {
          occupied += 1;
          if (position.x < puzzle.size.width / 2) left += 1;
          else right += 1;
        }
      }
      expect(occupied / cells).toBeGreaterThanOrEqual(0.35);
      expect(occupied / cells).toBeLessThanOrEqual(0.5);
      expect(left / right).toBeGreaterThan(0.9);
      expect(left / right).toBeLessThan(1.1);
    }
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

  it("resets progress without changing the generated puzzle", () => {
    const session = createSession(THEMES[0]!, calculatePuzzleProfile(390, 844), "reset-test");
    const progressed = gameReducer(session, { type: "attempt", word: session.targetWords[0]!, color: "#123456", elapsedMs: 12_345 });
    const reset = resetSession(progressed);
    expect(reset.id).not.toBe(progressed.id);
    expect(reset.puzzle).toBe(progressed.puzzle);
    expect(reset.targetWords).toBe(progressed.targetWords);
    expect(reset.solvedWords).toEqual([]);
    expect(reset.solvedColors).toEqual({});
    expect(reset.attempts).toBe(0);
    expect(reset.elapsedMs).toBe(0);
    expect(reset.status).toBe("playing");
  });
});
