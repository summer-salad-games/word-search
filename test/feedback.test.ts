import { beforeEach, describe, expect, it, vi } from "vitest";

function audioContextStub() {
  const start = vi.fn();
  const context = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => new Promise<void>(() => undefined)),
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
  return { context, start };
}

describe("feedback audio lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("schedules first-cell audio synchronously while resuming a new context", async () => {
    const { context, start } = audioContextStub();
    const { playFeedback } = await import("../src/feedback.js");

    playFeedback("cell", true);

    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalled();
  });

  it("unlocks feedback without playing an audible confirmation", async () => {
    const { context, start } = audioContextStub();
    const { unlockFeedback } = await import("../src/feedback.js");

    unlockFeedback(true);

    expect(context.resume).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
});
