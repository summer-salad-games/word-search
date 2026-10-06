export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface GridSize {
  readonly width: number;
  readonly height: number;
}

export const Direction = {
  up: "up",
  upRight: "up-right",
  right: "right",
  downRight: "down-right",
  down: "down",
  downLeft: "down-left",
  left: "left",
  upLeft: "up-left",
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export interface PuzzleConfiguration {
  readonly gridSize: GridSize;
  readonly borderSize: number;
  /** Whether words may be placed in border cells. */
  readonly useBorder: boolean;
  readonly straightness: number;
  readonly reverseWordProbability: number;
  /** Controls how densely the playable cells are used as placement starting points. */
  readonly fillPercentage: number;
  readonly wordsOverlap: boolean;
  readonly selfIntersect: boolean;
  readonly wordsIntersect: boolean;
  readonly useBacktracking: boolean;
  readonly useSmallerWordFallback: boolean;
  readonly allowedDirections: readonly Direction[];
  /** Whether otherwise-empty border cells receive random letters. */
  readonly fillBorder: boolean;
  readonly restrictedFillLetters: readonly string[];
  readonly fillLetters: readonly string[];
}

export interface PuzzleInput {
  readonly words: readonly string[];
  readonly configuration?: Partial<PuzzleConfiguration> & {
    readonly gridSize?: Partial<GridSize>;
  };
  readonly theme?: string;
  /** A number or string produces repeatable output. */
  readonly seed?: number | string;
  /** Must return a finite number in the half-open interval [0, 1). */
  readonly random?: () => number;
}

export interface PuzzleCell {
  readonly position: Position;
  readonly letter: string;
  readonly words: readonly string[];
  readonly isBorder: boolean;
}

export interface PlacedWord {
  readonly word: string;
  /** The normalized word in the order used while generating the path. */
  readonly displayedWord: string;
  readonly reversed: boolean;
  /** Always traces `word` from its first Unicode code point to its last. */
  readonly path: readonly Position[];
  /** One direction for each transition between positions. */
  readonly directions: readonly Direction[];
}

export interface PuzzleResult {
  readonly theme?: string;
  /** The complete grid, including border cells, indexed as grid[y][x]. */
  readonly grid: readonly (readonly PuzzleCell[])[];
  readonly size: GridSize;
  readonly playableSize: GridSize;
  readonly borderSize: number;
  /** Every entry path reads as entry.word, even when it was generated in reverse. */
  readonly entries: readonly PlacedWord[];
  readonly unplacedWords: readonly string[];
}
