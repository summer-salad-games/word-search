import { BASE_THEME_COUNT, THEME_BANKS } from "./theme-banks.js";

export interface PuzzleTheme {
  readonly id: string;
  readonly title: string;
  readonly words: readonly string[];
  readonly colors: readonly string[];
}

const PALETTES: readonly (readonly string[])[] = Object.freeze([
  ["#168aad", "#52b788", "#e9c46a", "#f4a261", "#9b5de5", "#ef476f"],
  ["#0077b6", "#00b4d8", "#48cae4", "#ff9f1c", "#2ec4b6", "#5e60ce"],
  ["#4361ee", "#7209b7", "#f72585", "#4cc9f0", "#ffbe0b", "#8338ec"],
  ["#e76f51", "#2a9d8f", "#e9c46a", "#6d597a", "#f28482", "#84a59d"],
  ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51", "#457b9d"],
  ["#3a86ff", "#8338ec", "#ff006e", "#fb5607", "#ffbe0b", "#06d6a0"],
  ["#588157", "#a3b18a", "#bc6c25", "#dda15e", "#606c38", "#6d597a"],
  ["#277da1", "#577590", "#43aa8b", "#90be6d", "#f9c74f", "#f94144"],
]);

const singleWordTitle = (title: string): string => title.replace(/\s+/gu, "");

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export const THEMES: readonly PuzzleTheme[] = Object.freeze(THEME_BANKS.map((bank, bankIndex) => {
    const id = bankIndex < BASE_THEME_COUNT ? `${bank.id}-essentials` : bank.id;
    const words = [...bank.words].sort((left, right) => hash(`${id}:${left}`) - hash(`${id}:${right}`)).slice(0, 22);
    return Object.freeze({
      id,
      title: singleWordTitle(bank.title),
      words: Object.freeze(words),
      colors: PALETTES[bankIndex % PALETTES.length]!,
    });
  }));

export function selectRandomTheme(completedIds: ReadonlySet<string> = new Set(), random: () => number = Math.random): PuzzleTheme | undefined {
  const available = THEMES.filter((theme) => !completedIds.has(theme.id));
  if (available.length === 0) return undefined;
  const index = Math.min(available.length - 1, Math.floor(random() * available.length));
  return available[Math.max(0, index)]!;
}

export function getTheme(themeId: string): PuzzleTheme {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0]!;
}
