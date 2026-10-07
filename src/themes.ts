import { THEME_BANKS } from "./theme-banks.js";

export interface PuzzleTheme {
  readonly id: string;
  readonly title: string;
  readonly words: readonly string[];
  readonly colors: readonly string[];
  readonly rare?: boolean;
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

const VARIANTS = ["Essentials", "Explorer", "Discovery", "Challenge", "Collection", "Quest", "Mosaic"] as const;

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

const STANDARD_THEMES: readonly PuzzleTheme[] = THEME_BANKS.flatMap((bank, bankIndex) =>
  VARIANTS.map((variant, variantIndex) => {
    const id = `${bank.id}-${variant.toLowerCase()}`;
    const words = [...bank.words].sort((left, right) => hash(`${id}:${left}`) - hash(`${id}:${right}`)).slice(0, 22);
    return Object.freeze({
      id,
      title: `${bank.title} ${variant}`,
      words: Object.freeze(words),
      colors: PALETTES[(bankIndex + variantIndex) % PALETTES.length]!,
    });
  }),
);

const rare = (id: string, title: string, words: string): PuzzleTheme => Object.freeze({
  id: `egg-${id}`,
  title,
  words: Object.freeze(words.trim().split(/\s+/u)),
  colors: PALETTES[hash(id) % PALETTES.length]!,
  rare: true,
});

const RARE_THEMES: readonly PuzzleTheme[] = Object.freeze([
  rare("emoji", "😀 Emoji Party", "😀 😃 😄 😁 😆 😅 😂 😊 😇 🙂 🙃 😉 😌 😍 🥰 😎 🤓 🥳 🤩 😴 🤖 👻 👽 🎃 🐵 🦊 🐼 🦄 🐸"),
  rare("morse", "••• Morse Signals", "a·− b−··· c−·−· d−·· e· f··−· g−−· h···· i·· j·−−− k−·− l·−·· m−− n−· o−−− p·−−· q−−·− r·−· s··· t− u··− v···− w·−− x−··− y−·−− z−−··"),
  rare("points", "All Points Bulletin", "! ? . , : ; + - = / \\ | _ ~ ^ # @ $ % & * < > ( ) [ ] { }"),
  rare("palindrome", "Back to Front", "level radar civic rotor kayak refer madam racecar noon tenet stats solos minim reviver repaper deified rotator wow mom dad eye peep toot pop gig"),
  rare("keyboard", "Keyboard Secret", "qwerty asdf zxcv hjkl uiop qaz wsx edc rfv tgb yhn ujm ikol shift enter escape tab space caps ctrl alt delete home end insert pageup pagedown cursor"),
  rare("found", "You Found Me", "found hidden secret spotted revealed uncovered located discovered noticed solved search seek clue trail answer surprise reward treasure easter egg inside between beneath beyond almost there congratulations"),
  rare("error", "404 Theme Found", "error warning missing unknown retry reboot loading offline online cache cookie server client request response status timeout redirect broken fixed debug trace stack console network protocol packet glitch feature unexpected"),
  rare("greek", "It Is All Greek", "α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω"),
  rare("developer", "Developer Console", "console debug breakpoint variable function object array string boolean promise async await return import export render state effect event pointer cache storage database browser commit branch merge test build deploy localhost"),
  rare("magic", "Secret Spellbook", "abracadabra alakazam hocus pocus shimmer sparkle whisper moonbeam stardust enchant charm potion crystal oracle rune wand cauldron phantom dragon phoenix unicorn wizard secret hidden mystery wonder"),
]);

export const THEMES: readonly PuzzleTheme[] = Object.freeze([...STANDARD_THEMES, ...RARE_THEMES]);

export function selectRandomTheme(completedIds: ReadonlySet<string> = new Set(), random: () => number = Math.random): PuzzleTheme | undefined {
  const standard = STANDARD_THEMES.filter((theme) => !completedIds.has(theme.id));
  const rare = RARE_THEMES.filter((theme) => !completedIds.has(theme.id));
  if (standard.length === 0 && rare.length === 0) return undefined;
  const preferRare = random() < 0.02;
  const pool = preferRare
    ? (rare.length > 0 ? rare : standard)
    : (standard.length > 0 ? standard : rare);
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[Math.max(0, index)]!;
}

export function getTheme(themeId: string): PuzzleTheme {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0]!;
}

export const THEME_COUNTS = Object.freeze({ common: STANDARD_THEMES.length, rare: RARE_THEMES.length, total: THEMES.length });
