import { describe, expect, it } from "vitest";
import { createStartMenuGrid } from "../src/start-menu.js";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function containsWord(grid: ReturnType<typeof createStartMenuGrid>, word: string): boolean {
  const selected = new Map(grid.cells.filter(({ color }) => color !== undefined).map((cell) => [`${cell.x},${cell.y}`, cell.letter]));
  const directions = [[1, 0], [0, 1]] as const;
  return grid.cells.some(({ x, y }) => directions.some(([dx, dy]) => [...word].every((letter, index) => selected.get(`${x + dx * index},${y + dy * index}`) === letter)));
}

describe("start menu grid", () => {
  it("fills the screen model around an exactly centered action tile", () => {
    const grid = createStartMenuGrid(390, 844, ["#111", "#222", "#333"], seededRandom(42));

    expect(grid.columns).toBeGreaterThanOrEqual(9);
    expect(grid.rows).toBeGreaterThanOrEqual(11);
    expect(grid.columns % 2).toBe(1);
    expect(grid.rows % 2).toBe(1);
    expect(grid.actionColumn + Math.floor(grid.actionSpan / 2)).toBe(Math.floor(grid.columns / 2));
    expect(grid.actionRow).toBe(Math.floor(grid.rows / 2));
    expect(grid.cells).toHaveLength(grid.columns * grid.rows - grid.actionSpan);
  });

  it("places WORD and SEARCH away from the action tile", () => {
    const grid = createStartMenuGrid(1_440, 1_000, ["#111", "#222", "#333"], seededRandom(7));
    const actionKeys = new Set(Array.from({ length: grid.actionSpan }, (_, offset) => `${grid.actionColumn + offset},${grid.actionRow}`));

    expect(containsWord(grid, "WORD")).toBe(true);
    expect(containsWord(grid, "SEARCH")).toBe(true);
    expect(grid.cells.every(({ x, y }) => !actionKeys.has(`${x},${y}`))).toBe(true);
    expect(new Set(grid.cells.flatMap(({ color }) => color === undefined ? [] : [color])).size).toBe(2);
  });
});
