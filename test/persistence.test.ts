import { beforeEach, describe, expect, it } from "vitest";
import { calculatePuzzleProfile, createSession } from "../src/app-model.js";
import { loadCompletedThemeIds, loadFeedbackSettings, loadHistory, resetApplicationState, saveCompletion, saveFeedbackSettings } from "../src/persistence.js";
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
      lettersSelected: 42,
      completedAt: new Date().toISOString(),
      profile: session.profile,
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
      lettersSelected: 6,
      completedAt: new Date().toISOString(),
      profile: session.profile,
    });

    await resetApplicationState();

    expect(await loadCompletedThemeIds()).toEqual([]);
    expect(await loadHistory()).toEqual([]);
  });

  it("defaults feedback to 75% volume and persists independent preferences", async () => {
    expect(await loadFeedbackSettings()).toEqual({ volume: 0.75, vibrationEnabled: true });
    await saveFeedbackSettings({ volume: 0.37, vibrationEnabled: false });
    expect(await loadFeedbackSettings()).toEqual({ volume: 0.37, vibrationEnabled: false });
  });
});
