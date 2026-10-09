type FeedbackKind = "cell" | "reject" | "word" | "complete";

interface FeedbackNote {
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly delay: number;
  readonly duration: number;
  readonly volume: number;
  readonly type: OscillatorType;
}

const NOTES: Readonly<Record<FeedbackKind, readonly FeedbackNote[]>> = {
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
let audioReady: Promise<AudioContext | undefined> | undefined;
let interactionUnlocked = false;
let previousCellFrequency = 530;
let lastCellFeedbackAt = 0;

async function readyContext(): Promise<AudioContext | undefined> {
  if (!interactionUnlocked) return undefined;
  const AudioContextConstructor = window.AudioContext;
  if (AudioContextConstructor === undefined) return undefined;
  audioContext ??= new AudioContextConstructor();
  if (audioContext.state === "suspended") {
    try { await audioContext.resume(); }
    catch { return undefined; }
  }
  if (audioContext.state !== "running") return undefined;
  return audioContext;
}

async function playNotes(notes: readonly FeedbackNote[]): Promise<void> {
  if (document.hidden) return;
  const currentContext = await (audioReady ?? readyContext());
  if (currentContext === undefined) return;
  const startedAt = currentContext.currentTime;
  for (const note of notes) {
    const oscillator = currentContext.createOscillator();
    const gain = currentContext.createGain();
    const noteStart = startedAt + note.delay;
    const noteEnd = noteStart + note.duration;
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    if (note.endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, noteEnd);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain).connect(currentContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.01);
  }
}

function vibrate(pattern: number | readonly number[]): void {
  if (!interactionUnlocked || document.hidden || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
}

export function unlockFeedback(enabled: boolean): void {
  if (!enabled || interactionUnlocked) return;
  interactionUnlocked = true;
  audioReady = readyContext().finally(() => { audioReady = undefined; });
}

export function playFeedback(kind: FeedbackKind, enabled: boolean): void {
  if (!enabled) return;
  if (kind === "cell") {
    const now = performance.now();
    if (now - lastCellFeedbackAt < 28) return;
    lastCellFeedbackAt = now;
    previousCellFrequency = previousCellFrequency === 530 ? 580 : 530;
    void playNotes(NOTES.cell.map((note, index) => index === 0
      ? { ...note, frequency: previousCellFrequency, endFrequency: previousCellFrequency - 140 }
      : note));
    vibrate(6);
    return;
  }
  void playNotes(NOTES[kind]);
  if (kind === "word") vibrate(12);
  if (kind === "complete") vibrate([12, 38, 16]);
}
