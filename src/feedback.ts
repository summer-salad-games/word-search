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
  cell: [{ frequency: 740, endFrequency: 540, delay: 0, duration: 0.032, volume: 0.018, type: "triangle" }],
  reject: [{ frequency: 280, endFrequency: 180, delay: 0, duration: 0.032, volume: 0.011, type: "square" }],
  word: [
    { frequency: 660, endFrequency: 740, delay: 0, duration: 0.05, volume: 0.022, type: "triangle" },
    { frequency: 940, endFrequency: 1_040, delay: 0.052, duration: 0.075, volume: 0.019, type: "triangle" },
  ],
  complete: [
    { frequency: 620, endFrequency: 690, delay: 0, duration: 0.06, volume: 0.021, type: "triangle" },
    { frequency: 820, endFrequency: 900, delay: 0.065, duration: 0.07, volume: 0.02, type: "triangle" },
    { frequency: 1_080, endFrequency: 1_180, delay: 0.14, duration: 0.1, volume: 0.018, type: "triangle" },
  ],
};

let audioContext: AudioContext | undefined;
let previousCellFrequency = 720;
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
    previousCellFrequency = previousCellFrequency === 720 ? 790 : 720;
    playNotes([{ ...NOTES.cell[0]!, frequency: previousCellFrequency, endFrequency: previousCellFrequency - 200 }]);
    vibrate(6);
    return;
  }
  playNotes(NOTES[kind]);
  if (kind === "word") vibrate(12);
  if (kind === "complete") vibrate([12, 38, 16]);
}
