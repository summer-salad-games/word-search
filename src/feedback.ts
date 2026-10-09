type FeedbackKind = "cell" | "reject" | "word" | "complete";

interface FeedbackNote {
  readonly frequency: number;
  readonly delay: number;
  readonly duration: number;
  readonly volume: number;
  readonly type: OscillatorType;
}

const NOTES: Readonly<Record<FeedbackKind, readonly FeedbackNote[]>> = {
  cell: [{ frequency: 560, delay: 0, duration: 0.018, volume: 0.012, type: "sine" }],
  reject: [{ frequency: 230, delay: 0, duration: 0.026, volume: 0.009, type: "triangle" }],
  word: [
    { frequency: 620, delay: 0, duration: 0.045, volume: 0.018, type: "sine" },
    { frequency: 820, delay: 0.052, duration: 0.065, volume: 0.015, type: "sine" },
  ],
  complete: [
    { frequency: 590, delay: 0, duration: 0.055, volume: 0.017, type: "sine" },
    { frequency: 740, delay: 0.07, duration: 0.06, volume: 0.017, type: "sine" },
    { frequency: 940, delay: 0.145, duration: 0.09, volume: 0.015, type: "sine" },
  ],
};

let audioContext: AudioContext | undefined;
let previousCellFrequency = 560;
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
    previousCellFrequency = previousCellFrequency === 560 ? 610 : 560;
    playNotes([{ ...NOTES.cell[0]!, frequency: previousCellFrequency }]);
    vibrate(6);
    return;
  }
  playNotes(NOTES[kind]);
  if (kind === "word") vibrate(12);
  if (kind === "complete") vibrate([12, 38, 16]);
}
