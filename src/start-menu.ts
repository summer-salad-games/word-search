export interface StartMenuCell {
  readonly x: number;
  readonly y: number;
  readonly letter: string;
  readonly color?: string;
}

export interface StartMenuGrid {
  readonly columns: number;
  readonly rows: number;
  readonly actionColumn: number;
  readonly actionRow: number;
  readonly actionSpan: number;
  readonly cells: readonly StartMenuCell[];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const WORDS = ["WORD", "SEARCH"] as const;

function cryptoRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
}

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

function oddCount(length: number, targetCellSize: number, minimum: number): number {
  const count = Math.max(minimum, Math.ceil(length / targetCellSize));
  return count % 2 === 0 ? count + 1 : count;
}

export function createStartMenuGrid(
  width: number,
  height: number,
  colors: readonly string[],
  random: () => number = cryptoRandom,
): StartMenuGrid {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new Error("Screen dimensions must be positive.");
  if (colors.length < 2) throw new Error("At least two selection colors are required.");

  const targetCellSize = width < 600 ? 48 : 58;
  const columns = oddCount(width, targetCellSize, 9);
  const rows = oddCount(height, targetCellSize, 11);
  const actionSpan = 3;
  const actionColumn = Math.floor(columns / 2) - Math.floor(actionSpan / 2);
  const actionRow = Math.floor(rows / 2);
  const actionKeys = new Set(Array.from({ length: actionSpan }, (_, offset) => `${actionColumn + offset},${actionRow}`));
  const occupied = new Set(actionKeys);
  const selected = new Map<string, { letter: string; color: string }>();
  const firstColor = randomIndex(colors.length, random);
  const secondColor = (firstColor + 1 + randomIndex(colors.length - 1, random)) % colors.length;

  for (const [wordIndex, word] of WORDS.entries()) {
    const color = colors[wordIndex === 0 ? firstColor : secondColor]!;
    let path: { x: number; y: number }[] | undefined;
    for (let attempt = 0; attempt < 200 && path === undefined; attempt += 1) {
      const horizontal = random() < 0.5;
      const maxX = horizontal ? columns - word.length : columns - 1;
      const maxY = horizontal ? rows - 1 : rows - word.length;
      const x = randomIndex(maxX + 1, random);
      const y = randomIndex(maxY + 1, random);
      const candidate = [...word].map((_, index) => ({ x: x + (horizontal ? index : 0), y: y + (horizontal ? 0 : index) }));
      if (candidate.every((position) => !occupied.has(`${position.x},${position.y}`))) path = candidate;
    }
    if (path === undefined) throw new Error(`Could not place decorative word ${word}.`);
    path.forEach((position, index) => {
      const key = `${position.x},${position.y}`;
      occupied.add(key);
      selected.set(key, { letter: word[index]!, color });
    });
  }

  const cells: StartMenuCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const key = `${x},${y}`;
      if (actionKeys.has(key)) continue;
      const selection = selected.get(key);
      cells.push({
        x,
        y,
        letter: selection?.letter ?? LETTERS[randomIndex(LETTERS.length, random)]!,
        ...(selection === undefined ? {} : { color: selection.color }),
      });
    }
  }

  return { columns, rows, actionColumn, actionRow, actionSpan, cells };
}

export function changeStartMenuLetters(
  cells: readonly StartMenuCell[],
  current: ReadonlyMap<string, string>,
  count: number,
  random: () => number = cryptoRandom,
): ReadonlyMap<string, string> {
  const ordinary = cells.filter(({ color }) => color === undefined);
  const changed = new Set<string>();
  const next = new Map(current);
  while (changed.size < Math.min(count, ordinary.length)) {
    const cell = ordinary[randomIndex(ordinary.length, random)]!;
    const key = `${cell.x},${cell.y}`;
    if (changed.has(key)) continue;
    changed.add(key);
    const previous = next.get(key) ?? cell.letter;
    const previousIndex = LETTERS.indexOf(previous);
    next.set(key, LETTERS[(previousIndex + 1 + randomIndex(LETTERS.length - 1, random)) % LETTERS.length]!);
  }
  return next;
}
