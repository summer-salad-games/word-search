# Word Search Generator

A framework-independent, browser-compatible TypeScript library for generating word-search grids. It has no runtime dependencies and does not use DOM, canvas, or game-engine APIs.

## Install and build

```sh
npm install
npm run build
```

## Usage

```ts
import { generatePuzzle } from "@summer-salad-games/word-search";

const puzzle = generatePuzzle({
  theme: "Nature",
  words: ["sun", "sky", "tree", "forest", "meadow"],
  seed: "daily-puzzle-2026-10-06",
});

console.log(puzzle.grid);          // Complete grid, indexed as grid[y][x]
console.log(puzzle.entries);       // Words and their paths
console.log(puzzle.unplacedWords); // Normalized words that could not be placed
```

Coordinates start at the top-left of the full grid. `x` increases to the right and `y` increases downward. The default configuration reproduces the supplied Unity asset: a 15-by-17 playable area surrounded by a one-cell border.

Inputs are trimmed and lowercased without splitting Unicode surrogate pairs. Invalid configuration, empty words, and duplicates after normalization throw `PuzzleValidationError`. Generation never mutates caller-owned arrays or objects.

Pass either `seed` for repeatable generation or `random` to inject a function returning values in `[0, 1)`. Supplying both is an error.

## Configuration

`DEFAULT_CONFIGURATION` matches the supplied Unity configuration. Pass a partial `configuration` object to override it. The main controls are:

- `gridSize`: width and height of the playable area.
- `borderSize`, `useBorder`, and `fillBorder`: border dimensions, word placement, and filler behavior.
- `straightness` and `reverseWordProbability`: probabilities in the inclusive range 0–1.
- `fillPercentage`: the proportion of playable cells considered as randomized starting points. It is a generation-density control, not a guaranteed final occupancy percentage.
- `wordsOverlap`, `selfIntersect`, and `wordsIntersect`: placement intersection rules.
- `useBacktracking` and `useSmallerWordFallback`: bounded recovery behavior when a path cannot continue.
- `allowedDirections`: any unique values from the exported `Direction` object.
- `fillLetters` and `restrictedFillLetters`: Unicode code points used for empty cells.

The generator validates all configuration at runtime. Words that remain impossible to place are returned in `unplacedWords`; this is a normal generation result rather than an exception.

Random filler is checked before the result is returned. If filler letters accidentally form another valid path for a placed target word, the conflicting filler cells are rerolled. The search uses the configured directions and their opposites so reversed targets remain unambiguous. If the configured filler alphabet makes a unique fill impossible, generation throws `PuzzleGenerationError` instead of returning an ambiguous puzzle.

## Commands

- `npm test` runs behavioral tests.
- `npm run check` performs strict type checking.
- `npm run build` emits browser-compatible ESM and declarations into `dist/`.
