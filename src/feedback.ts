type FeedbackKind = "start" | "cell" | "reject" | "word" | "complete";

export interface FeedbackSettings {
  readonly volume: number;
  readonly vibrationEnabled: boolean;
}

export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = { volume: 0.75, vibrationEnabled: true };
const MAX_VOLUME_MULTIPLIER = 3;

interface FeedbackNote {
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly delay: number;
  readonly duration: number;
  readonly volume: number;
  readonly type: OscillatorType;
}

const NOTES: Readonly<Record<FeedbackKind, readonly FeedbackNote[]>> = {
  start: [
    { frequency: 720, endFrequency: 860, delay: 0, duration: 0.065, volume: 0.027, type: "sine" },
    { frequency: 1_080, endFrequency: 1_180, delay: 0.045, duration: 0.055, volume: 0.018, type: "sine" },
  ],
  cell: [
    { frequency: 550, endFrequency: 410, delay: 0, duration: 0.042, volume: 0.03, type: "sine" },
    { frequency: 1_400, endFrequency: 900, delay: 0, duration: 0.016, volume: 0.011, type: "sine" },
  ],
  reject: [{ frequency: 340, endFrequency: 240, delay: 0, duration: 0.042, volume: 0.02, type: "sine" }],
  word: [
    { frequency: 620, endFrequency: 680, delay: 0, duration: 0.075, volume: 0.032, type: "sine" },
    { frequency: 900, endFrequency: 970, delay: 0.07, duration: 0.11, volume: 0.027, type: "sine" },
  ],
  complete: [
    { frequency: 520, endFrequency: 570, delay: 0, duration: 0.085, volume: 0.03, type: "sine" },
    { frequency: 780, endFrequency: 840, delay: 0.085, duration: 0.1, volume: 0.027, type: "sine" },
    { frequency: 1_040, endFrequency: 1_120, delay: 0.18, duration: 0.14, volume: 0.024, type: "sine" },
  ],
};

let audioContext: AudioContext | undefined;
let hapticsUnlocked = false;
let previousCellFrequency = 530;
let lastCellFeedbackAt = 0;

function currentContext(): AudioContext | undefined {
  const AudioContextConstructor = window.AudioContext;
  if (AudioContextConstructor === undefined) return undefined;
  if (audioContext?.state === "closed") {
    audioContext = undefined;
  }
  audioContext ??= new AudioContextConstructor({ latencyHint: "interactive" });
  return audioContext;
}

function scheduleNotes(context: AudioContext, notes: readonly FeedbackNote[], volume: number): void {
  const startedAt = context.currentTime + 0.015;
  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startedAt + note.delay;
    const noteEnd = noteStart + note.duration;
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    if (note.endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, noteEnd);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.volume * Math.min(1, Math.max(0, volume)) * MAX_VOLUME_MULTIPLIER, noteStart + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.01);
  }
}

function playNotes(notes: readonly FeedbackNote[], volume: number): void {
  if (document.hidden) return;
  const context = currentContext();
  if (context === undefined || context.state === "closed") return;
  if (context.state === "running") {
    scheduleNotes(context, notes, volume);
    return;
  }
  void context.resume().then(() => {
    if (context.state === "running") scheduleNotes(context, notes, volume);
  }).catch(() => undefined);
}

function vibrate(pattern: number | readonly number[]): void {
  if (!hapticsUnlocked || document.hidden || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
}

export async function startFeedback(settings: FeedbackSettings): Promise<void> {
  hapticsUnlocked = settings.vibrationEnabled;
  if (settings.volume <= 0 || document.hidden) return;
  const context = currentContext();
  if (context?.state !== "suspended") return;
  try { await context.resume(); }
  catch { /* Sound remains unavailable; gameplay can still start. */ }
}

export function playFeedback(kind: FeedbackKind, settings: FeedbackSettings): void {
  if (kind === "cell") {
    const now = performance.now();
    if (now - lastCellFeedbackAt < 28) return;
    lastCellFeedbackAt = now;
    previousCellFrequency = previousCellFrequency === 530 ? 580 : 530;
    if (settings.volume > 0) playNotes(NOTES.cell.map((note, index) => index === 0
      ? { ...note, frequency: previousCellFrequency, endFrequency: previousCellFrequency - 140 }
      : note), settings.volume);
    if (settings.vibrationEnabled) vibrate(6);
    return;
  }
  if (settings.volume > 0) playNotes(NOTES[kind], settings.volume);
  if (kind === "word" && settings.vibrationEnabled) vibrate(12);
  if (kind === "complete" && settings.vibrationEnabled) vibrate([12, 38, 16]);
}
