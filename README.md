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

Inputs are trimmed, normalized to Unicode NFC, and lowercased without splitting Unicode surrogate pairs. Invalid configuration, empty words, and duplicates after normalization throw `PuzzleValidationError`. Generation never mutates caller-owned arrays or objects.

Pass either `seed` for repeatable generation or `random` to inject a function returning values in `[0, 1)`. Supplying both is an error.

## Configuration

`DEFAULT_CONFIGURATION` matches the supplied Unity configuration. Pass a partial `configuration` object to override it. The main controls are:

- `gridSize`: width and height of the playable area.
- `borderSize`, `useBorder`, and `fillBorder`: border dimensions, word placement, and filler behavior.
- `straightness` and `reverseWordProbability`: probabilities in the inclusive range 0–1.
- `fillPercentage`: the proportion of playable cells considered as randomized starting points. It is a generation-density control, not a guaranteed final occupancy percentage.
- `wordsOverlap`, `selfIntersect`, and `wordsIntersect`: placement intersection rules.
- `useBacktracking` and `useSmallerWordFallback`: bounded recovery behavior when a path cannot continue.
- `allowedDirections`: solve directions selected from the exported `Direction` object. Reversed words are generated in the opposite direction so their canonical solution still follows an allowed direction.
- `fillLetters` and `restrictedFillLetters`: Unicode code points used for empty cells.

The generator validates all configuration at runtime. Words that remain impossible to place are returned in `unplacedWords`; this is a normal generation result rather than an exception.

For predictable browser memory and recursion use, each word is limited to 256 Unicode code points. The complete grid, including borders, is limited to 512 cells per dimension and 65,536 cells in total.

Every word placement is checked against the complete grid and rejected if it creates another valid solution for any target. Random filler receives the same check and conflicting filler cells are rerolled. If the configured filler alphabet makes a unique fill impossible, generation throws `PuzzleGenerationError` instead of returning an ambiguous puzzle.

## Commands

- `npm test` runs behavioral tests.
- `npm run check` performs strict type checking.
- `npm run build` emits browser-compatible ESM and declarations into `dist/`.
