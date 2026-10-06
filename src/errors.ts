export class PuzzleValidationError extends Error {
  public readonly name = "PuzzleValidationError";

  public constructor(message: string) {
    super(message);
  }
}

export class PuzzleGenerationError extends Error {
  public readonly name = "PuzzleGenerationError";

  public constructor(message: string) {
    super(message);
  }
}
