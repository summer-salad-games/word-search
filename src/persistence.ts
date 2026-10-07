import { openDB, type DBSchema } from "idb";
import { z } from "zod";
import { GENERATOR_VERSION, type GameSession, type PuzzleProfile } from "./app-model.js";

export type ColorMode = "light" | "dark" | "system";

export interface HistoryRecord {
  readonly id: string;
  readonly themeId: string;
  readonly themeTitle: string;
  readonly seed: string;
  readonly elapsedMs: number;
  readonly wordCount: number;
  readonly attempts: number;
  readonly completedAt: string;
  readonly profile: PuzzleProfile;
  readonly generatorVersion: number;
}

interface WordSearchDatabase extends DBSchema {
  state: { key: "active-game" | "color-mode" | "completed-themes"; value: unknown };
  history: { key: string; value: HistoryRecord; indexes: { "by-completed": string } };
}

const positionSchema = z.object({ x: z.number().int(), y: z.number().int() });
const profileSchema = z.object({
  columns: z.number().int().positive(), rows: z.number().int().positive(), borderSize: z.number().int().nonnegative(),
  targetWordCount: z.number().int().positive(), preferredCellSize: z.number().positive(),
});
const cellSchema = z.object({ position: positionSchema, letter: z.string(), words: z.array(z.string()), isBorder: z.boolean() });
const entrySchema = z.object({
  word: z.string(), displayedWord: z.string(), reversed: z.boolean(), path: z.array(positionSchema), directions: z.array(z.string()),
});
const puzzleSchema = z.object({
  theme: z.string().optional(), grid: z.array(z.array(cellSchema)),
  size: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  playableSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  borderSize: z.number().int().nonnegative(), entries: z.array(entrySchema), unplacedWords: z.array(z.string()),
});
const sessionSchema = z.object({
  id: z.string(), themeId: z.string(), seed: z.string(), puzzle: puzzleSchema,
  targetWords: z.array(z.string()), solvedWords: z.array(z.string()), solvedColors: z.record(z.string(), z.string()), attempts: z.number().int().nonnegative(),
  elapsedMs: z.number().nonnegative(), status: z.enum(["playing", "completed"]), profile: profileSchema,
  completedAt: z.string().optional(),
});
const persistedSessionSchema = z.object({ generatorVersion: z.number().int(), session: sessionSchema });
const completedThemesSchema = z.array(z.string()).transform((ids) => [...new Set(ids)]);
const historySchema = z.object({
  id: z.string(), themeId: z.string(), themeTitle: z.string(), seed: z.string(), elapsedMs: z.number().nonnegative(),
  wordCount: z.number().int().nonnegative(), attempts: z.number().int().nonnegative(), completedAt: z.string(),
  profile: profileSchema, generatorVersion: z.number().int(),
});

const database = openDB<WordSearchDatabase>("word-search-game", 1, {
  upgrade(db) {
    db.createObjectStore("state");
    const history = db.createObjectStore("history", { keyPath: "id" });
    history.createIndex("by-completed", "completedAt");
  },
});

export async function loadActiveGame(): Promise<GameSession | undefined> {
  const value = await (await database).get("state", "active-game");
  const parsed = persistedSessionSchema.safeParse(value);
  return parsed.success && parsed.data.generatorVersion === GENERATOR_VERSION
    ? parsed.data.session as GameSession
    : undefined;
}

export async function saveActiveGame(session: GameSession): Promise<void> {
  await (await database).put("state", structuredClone({ generatorVersion: GENERATOR_VERSION, session }), "active-game");
}

export async function clearActiveGame(): Promise<void> {
  await (await database).delete("state", "active-game");
}

export async function resetApplicationState(): Promise<void> {
  const db = await database;
  const transaction = db.transaction(["state", "history"], "readwrite");
  await Promise.all([transaction.objectStore("state").clear(), transaction.objectStore("history").clear(), transaction.done]);
}

export async function loadColorMode(): Promise<ColorMode> {
  const value = await (await database).get("state", "color-mode");
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export async function saveColorMode(mode: ColorMode): Promise<void> {
  await (await database).put("state", mode, "color-mode");
}

export async function saveCompletion(record: HistoryRecord): Promise<readonly string[]> {
  const parsed = historySchema.parse(record);
  const db = await database;
  const transaction = db.transaction(["state", "history"], "readwrite");
  const state = transaction.objectStore("state");
  const existing = completedThemesSchema.safeParse(await state.get("completed-themes"));
  const completed = new Set(existing.success ? existing.data : []);
  completed.add(parsed.themeId);
  await Promise.all([
    state.put([...completed], "completed-themes"),
    transaction.objectStore("history").put(parsed),
    transaction.done,
  ]);
  return [...completed];
}

export async function loadCompletedThemeIds(): Promise<readonly string[]> {
  const parsed = completedThemesSchema.safeParse(await (await database).get("state", "completed-themes"));
  return parsed.success ? parsed.data : [];
}

export async function loadHistory(): Promise<HistoryRecord[]> {
  const values = await (await database).getAllFromIndex("history", "by-completed");
  return values.flatMap((value) => {
    const parsed = historySchema.safeParse(value);
    return parsed.success && parsed.data.generatorVersion <= GENERATOR_VERSION ? [parsed.data] : [];
  }).reverse();
}
