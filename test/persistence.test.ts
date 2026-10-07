import { beforeEach, describe, expect, it } from "vitest";
import { calculatePuzzleProfile, createSession, GENERATOR_VERSION } from "../src/app-model.js";
import { loadCompletedThemeIds, loadHistory, resetApplicationState, saveCompletion } from "../src/persistence.js";
import { THEMES } from "../src/themes.js";

describe("playthrough persistence", () => {
  beforeEach(async () => resetApplicationState());

  it("saves history and completed-theme progress together without duplicates", async () => {
    const session = createSession(THEMES[0]!, calculatePuzzleProfile(390, 844), "completion-test");
    const record = {
      id: session.id,
      themeId: session.themeId,
      themeTitle: THEMES[0]!.title,
      seed: session.seed,
      elapsedMs: 12_345,
      wordCount: session.targetWords.length,
      attempts: 7,
      completedAt: new Date().toISOString(),
      profile: session.profile,
      generatorVersion: GENERATOR_VERSION,
    };

    await saveCompletion(record);
    await saveCompletion(record);

    expect(await loadCompletedThemeIds()).toEqual([session.themeId]);
    expect(await loadHistory()).toHaveLength(1);
  });

  it("clears both the lifetime history and playthrough progress", async () => {
    const session = createSession(THEMES[0]!, calculatePuzzleProfile(390, 844), "reset-completion-test");
    await saveCompletion({
      id: session.id,
      themeId: session.themeId,
      themeTitle: THEMES[0]!.title,
      seed: session.seed,
      elapsedMs: 1,
      wordCount: session.targetWords.length,
      attempts: 1,
      completedAt: new Date().toISOString(),
      profile: session.profile,
      generatorVersion: GENERATOR_VERSION,
    });

    await resetApplicationState();

    expect(await loadCompletedThemeIds()).toEqual([]);
    expect(await loadHistory()).toEqual([]);
  });
});
