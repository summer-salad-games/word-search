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
    { frequency: 440, endFrequency: 320, delay: 0, duration: 0.042, volume: 0.018, type: "sine" },
    { frequency: 1_100, endFrequency: 720, delay: 0, duration: 0.016, volume: 0.006, type: "sine" },
  ],
  reject: [{ frequency: 260, endFrequency: 185, delay: 0, duration: 0.042, volume: 0.012, type: "sine" }],
  word: [
    { frequency: 520, endFrequency: 560, delay: 0, duration: 0.075, volume: 0.02, type: "sine" },
    { frequency: 780, endFrequency: 830, delay: 0.07, duration: 0.11, volume: 0.017, type: "sine" },
  ],
  complete: [
    { frequency: 440, endFrequency: 480, delay: 0, duration: 0.085, volume: 0.019, type: "sine" },
    { frequency: 660, endFrequency: 710, delay: 0.085, duration: 0.1, volume: 0.018, type: "sine" },
    { frequency: 880, endFrequency: 940, delay: 0.18, duration: 0.14, volume: 0.016, type: "sine" },
  ],
};

let audioContext: AudioContext | undefined;
let previousCellFrequency = 420;
let lastCellFeedbackAt = 0;

function context(): AudioContext | undefined {
  const AudioContextConstructor = window.AudioContext;
  if (AudioContextConstructor === undefined) return undefined;
  audioContext ??= new AudioContextConstructor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function playNotes(notes: readonly FeedbackNote[]): void {
  if (document.hidden) return;
  const currentContext = context();
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
  if (document.hidden || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
}

export function playFeedback(kind: FeedbackKind, enabled: boolean): void {
  if (!enabled) return;
  if (kind === "cell") {
    const now = performance.now();
    if (now - lastCellFeedbackAt < 28) return;
    lastCellFeedbackAt = now;
    previousCellFrequency = previousCellFrequency === 420 ? 460 : 420;
    playNotes(NOTES.cell.map((note, index) => index === 0
      ? { ...note, frequency: previousCellFrequency, endFrequency: previousCellFrequency - 120 }
      : note));
    vibrate(6);
    return;
  }
  playNotes(NOTES[kind]);
  if (kind === "word") vibrate(12);
  if (kind === "complete") vibrate([12, 38, 16]);
}
