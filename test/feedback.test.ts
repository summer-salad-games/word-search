import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = { volume: 1, vibrationEnabled: true } as const;

function audioContextStub() {
  const start = vi.fn();
  let resolveResume: (() => void) | undefined;
  let stateChange: (() => void) | undefined;
  const context = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => new Promise<void>((resolve) => { resolveResume = resolve; })),
    suspend: vi.fn(async () => { context.state = "suspended"; }),
    addEventListener: vi.fn((_type: string, listener: () => void) => { stateChange = listener; }),
    createOscillator: vi.fn(() => ({
      type: "sine",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn((target: unknown) => target),
      start,
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn().mockReturnThis(),
    })),
  };
  const constructor = vi.fn(() => context);
  Object.defineProperty(window, "AudioContext", { configurable: true, value: constructor });
  return {
    context,
    start,
    finishResume: () => {
      context.state = "running";
      resolveResume?.();
      stateChange?.();
    },
  };
}

describe("feedback audio lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts audio before gameplay and then plays cell feedback immediately", async () => {
    const { context, start, finishResume } = audioContextStub();
    const { playFeedback, startFeedback } = await import("../src/feedback.js");

    const ready = startFeedback(settings);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    finishResume();
    await ready;
    playFeedback("cell", settings);

    expect(start).toHaveBeenCalled();
  });

  it("resumes and plays one requested sound after returning from suspension", async () => {
    const { context, start, finishResume } = audioContextStub();
    const { playFeedback } = await import("../src/feedback.js");

    playFeedback("cell", settings);
    finishResume();

    expect(context.resume).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  });

  it("starts feedback without playing an audible confirmation", async () => {
    const { context, start } = audioContextStub();
    const { startFeedback } = await import("../src/feedback.js");

    void startFeedback(settings);

    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("plays a dedicated two-note start cue after audio is ready", async () => {
    const { context, start, finishResume } = audioContextStub();
    const { playFeedback, startFeedback } = await import("../src/feedback.js");

    const ready = startFeedback(settings);
    finishResume();
    await ready;
    playFeedback("start", settings);

    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("keeps only the newest sound while audio is resuming", async () => {
    const { start, finishResume } = audioContextStub();
    const { playFeedback } = await import("../src/feedback.js");

    playFeedback("start", settings);
    playFeedback("word", settings);
    playFeedback("reject", settings);
    finishResume();

    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  });

  it("discards deferred sounds when the page audio lifecycle resets", async () => {
    const { context, start, finishResume } = audioContextStub();
    const { playFeedback, resetFeedbackAudio } = await import("../src/feedback.js");

    playFeedback("complete", settings);
    resetFeedbackAudio();
    finishResume();
    await Promise.resolve();

    expect(start).not.toHaveBeenCalled();
  });

  it("cycles the authorized context before playing after a lifecycle reset", async () => {
    const { context, start, finishResume } = audioContextStub();
    const { playFeedback, resetFeedbackAudio, startFeedback } = await import("../src/feedback.js");
    const ready = startFeedback(settings);
    finishResume();
    await ready;
    expect(context.state).toBe("running");
    resetFeedbackAudio();

    playFeedback("start", settings);
    await vi.waitFor(() => expect(context.suspend).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(context.resume).toHaveBeenCalledTimes(2));
    finishResume();

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  });
});
