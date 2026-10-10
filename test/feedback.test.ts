import { beforeEach, describe, expect, it, vi } from "vitest";

function audioContextStub() {
  const start = vi.fn();
  let resolveResume: (() => void) | undefined;
  let stateChange: (() => void) | undefined;
  const context = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => new Promise<void>((resolve) => { resolveResume = resolve; })),
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

    const ready = startFeedback(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    finishResume();
    await ready;
    playFeedback("cell", true);

    expect(start).toHaveBeenCalled();
  });

  it("resumes and plays one requested sound after returning from suspension", async () => {
    const { context, start, finishResume } = audioContextStub();
    const { playFeedback } = await import("../src/feedback.js");

    playFeedback("cell", true);
    finishResume();
    await Promise.resolve();

    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("starts feedback without playing an audible confirmation", async () => {
    const { context, start } = audioContextStub();
    const { startFeedback } = await import("../src/feedback.js");

    void startFeedback(true);

    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
});
