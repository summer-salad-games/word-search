export class PuzzleValidationError extends Error {
  public readonly name = "PuzzleValidationError";

  public constructor(message: string) {
    super(message);
  }
}
