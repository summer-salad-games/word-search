import { expect, test } from "@playwright/test";

async function enterGame(page: import("@playwright/test").Page, navigate = true) {
  if (navigate) await page.goto("/");
  const startButton = page.getByRole("button", { name: /^(New Game|Continue)$/ });
  await expect(startButton).toBeVisible();
  await startButton.click();
  await page.locator(".puzzle-grid").waitFor();
}

async function solveCurrentPuzzle(page: import("@playwright/test").Page) {
  const chips = page.locator(".word-chip");
  const words = await chips.allTextContents();
  const cells = await page.locator("[data-cell]").evaluateAll((elements) => elements.map((element) => ({
    x: Number((element as HTMLElement).dataset.x), y: Number((element as HTMLElement).dataset.y),
    letter: element.textContent?.trim().toLowerCase() ?? "",
  })));
  const byPosition = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
  const moves = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    await expect(page.locator(".puzzle-grid")).not.toHaveClass(/is-locked/);
    const word = words[wordIndex]!.trim().replace("✓", "").toLowerCase();
    const path: typeof cells = [];
    const visited = new Set<string>();
    const search = (x: number, y: number, index: number): boolean => {
      const key = `${x},${y}`;
      const cell = byPosition.get(key);
      if (cell?.letter !== [...word][index] || visited.has(key)) return false;
      visited.add(key); path.push(cell);
      if (index === [...word].length - 1) return true;
      for (const [dx, dy] of moves) if (search(x + dx, y + dy, index + 1)) return true;
      path.pop(); visited.delete(key); return false;
    };
    for (const cell of cells) if (search(cell.x, cell.y, 0)) break;
    expect(path.length).toBe([...word].length);
    const boxes = await Promise.all(path.map((cell) => page.locator(`[data-x="${cell.x}"][data-y="${cell.y}"]`).boundingBox()));
    const first = boxes[0]!;
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
    await page.mouse.down();
    for (const box of boxes.slice(1)) await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 2 });
    await page.mouse.up();
    await expect(chips.nth(wordIndex)).toHaveClass(/is-solved/);
    if (wordIndex === 0 && words.length > 1) {
      await page.mouse.click(first!.x + first!.width / 2, first!.y + first!.height / 2);
      await expect(page.locator(".puzzle-cell.is-active")).toHaveCount(0);
    }
  }
  return words.reduce((total, word) => total + [...word.trim()].length, 0);
}

test("focuses the dynamic start grid on its centered action", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "New Game" });
  await expect(button).toBeVisible();
  const buttonBox = await button.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(buttonBox!.x + buttonBox!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(buttonBox!.y + buttonBox!.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
  expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(await page.locator(".menu-cell").first().evaluate((element) => getComputedStyle(element).backgroundColor));
  expect(await page.locator(".start-screen").evaluate((element) => getComputedStyle(element, "::after").backgroundImage)).toContain("radial-gradient");

  const ordinary = page.locator('[data-menu-cell]:not([data-selected="true"])');
  const selected = page.locator('[data-menu-cell][data-selected="true"]');
  const ordinaryBefore = await ordinary.allTextContents();
  const selectedBefore = await selected.allTextContents();
  await page.waitForTimeout(1_100);
  expect((await ordinary.allTextContents()).filter((letter, index) => letter !== ordinaryBefore[index]).length).toBeGreaterThanOrEqual(2);
  expect(await selected.allTextContents()).toEqual(selectedBefore);
});

test("plays a complete puzzle and persists it to history", async ({ page }) => {
  await enterGame(page);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  const themeTitle = (await heading.textContent())!;
  const wordCount = await page.locator(".word-chip").count();
  const lettersSelected = await solveCurrentPuzzle(page);
  await expect(page.getByRole("dialog", { name: "Nicely found." })).toBeVisible();
  await page.getByRole("button", { name: /Next puzzle/ }).click();
  await expect(heading).not.toHaveText(themeTitle);
  await page.getByRole("button", { name: "Open history" }).click();
  const history = page.getByRole("dialog", { name: "History" });
  await expect(history).toContainText(themeTitle);
  const progress = page.getByRole("region", { name: "Global progress" });
  await expect(progress).toContainText("Progress1 / 500");
  await expect(progress).toContainText(`Words found${wordCount}`);
  await expect(progress).toContainText(`Letters${lettersSelected}`);
  await expect(history).not.toContainText("Attempts");
});

test("congratulates the player after the final unique grid and resets the whole playthrough", async ({ page }) => {
  await enterGame(page);
  const currentThemeId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("word-search-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const active = await new Promise<{ session: { themeId: string } }>((resolve, reject) => {
      const request = db.transaction("state").objectStore("state").get("active-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return active.session.themeId;
  });
  await page.evaluate(async ({ currentThemeId }) => {
    const { THEMES } = await import("/src/themes.ts");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("word-search-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("state", "readwrite");
      transaction.objectStore("state").put(THEMES.map(({ id }) => id).filter((id) => id !== currentThemeId), "completed-themes");
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, { currentThemeId });
  await page.reload();
  await enterGame(page, false);
  await solveCurrentPuzzle(page);

  await expect(page.getByRole("dialog", { name: "You found them all!" })).toContainText("all 500 word-search grids");
  const lifetime = page.getByRole("region", { name: "Lifetime summary" });
  await expect(lifetime).toContainText("Puzzles1");
  await expect(lifetime).toContainText(/Words found\d+/);
  await expect(lifetime).toContainText(/Letters\d+/);
  await page.getByRole("button", { name: /Reset everything/ }).click();
  await expect(page.getByRole("dialog", { name: "You found them all!" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("word-search-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(["state", "history"], "readonly");
    const completed = await new Promise<unknown>((resolve, reject) => {
      const request = transaction.objectStore("state").get("completed-themes"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const historyCount = await new Promise<number>((resolve, reject) => {
      const request = transaction.objectStore("history").count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return { completed, historyCount };
  })).toEqual({ completed: undefined, historyCount: 0 });
});

test("rolls an incorrect selection back cell by cell", async ({ page }) => {
  await enterGame(page);
  const first = await page.locator('[data-x="1"][data-y="1"]').boundingBox();
  const second = await page.locator('[data-x="2"][data-y="1"]').boundingBox();
  await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(second!.x + second!.width / 2, second!.y + second!.height / 2, { steps: 3 });
  await expect.poll(() => page.locator(".puzzle-cell.is-active").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return style.backgroundColor === style.borderTopColor;
  })).toBe(true);
  await page.mouse.up();
  await expect(page.locator(".puzzle-grid")).toHaveClass(/is-locked/);
  await expect(page.locator(".puzzle-cell.is-active")).toHaveCount(0);
  await expect(page.locator(".puzzle-grid")).not.toHaveClass(/is-locked/);
  await expect(page.locator(".game-footer")).not.toContainText("attempt");
  const letters = await page.locator(".puzzle-cell").allTextContents();
  await page.getByRole("button", { name: "Reset progress" }).click();
  await expect(page.getByRole("dialog", { name: "What would you like to reset?" })).toBeVisible();
  await page.getByRole("button", { name: "Reset current board" }).click();
  await expect(page.locator(".game-footer")).toContainText("00:00");
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
});

test("fits the page and toggles from system dark mode on the first click", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await enterGame(page);
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth - document.documentElement.clientWidth, height: document.documentElement.scrollHeight - document.documentElement.clientHeight }))).toEqual({ width: 0, height: 0 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Toggle color mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".puzzle-grid")).toHaveCSS("cursor", "default");
  await expect(page.locator(".puzzle-cell").first()).toHaveCSS("user-select", "none");
  const cell = await page.locator(".puzzle-cell").first().boundingBox();
  expect(cell!.width).toBeGreaterThanOrEqual(44);
  expect(cell!.height).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat(await page.locator(".puzzle-cell").first().evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  const spacing = await page.evaluate(() => {
    const header = document.querySelector(".topbar")!.getBoundingClientRect();
    const words = document.querySelector(".word-list")!.getBoundingClientRect();
    const grid = document.querySelector(".puzzle-grid")!.getBoundingClientRect();
    const footer = document.querySelector(".game-footer")!.getBoundingClientRect();
    return {
      headerToWords: words.top - header.bottom,
      wordsToGrid: grid.top - words.bottom,
      centerOffset: (words.top + grid.bottom) / 2 - (header.bottom + footer.top) / 2,
    };
  });
  expect(spacing.headerToWords).toBeGreaterThan(spacing.wordsToGrid);
  expect(Math.abs(spacing.centerOffset)).toBeLessThanOrEqual(1);
});

test("persists the sound and haptics preference", async ({ page }) => {
  await enterGame(page);
  await page.getByRole("button", { name: "Disable sound and haptics" }).click();
  await expect(page.getByRole("button", { name: "Enable sound and haptics" })).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await enterGame(page, false);
  await expect(page.getByRole("button", { name: "Enable sound and haptics" })).toBeVisible();
});

test("fits a large iPhone when Safari exposes less height than the physical screen", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 430, height: 740 },
    screen: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await enterGame(page);
  const grid = page.locator(".puzzle-grid");
  await expect(grid).toHaveAttribute("aria-label", /^7 by 10/);
  await expect(page.locator(".game-label")).toHaveCSS("white-space", "nowrap");
  await expect(page.locator(".game-footer .timer")).toBeVisible();
  const feedbackButton = page.locator(".topbar-actions button[aria-pressed]");
  const buttonBackground = await feedbackButton.evaluate((element) => getComputedStyle(element).backgroundColor);
  await feedbackButton.click();
  await expect(feedbackButton).toHaveCSS("background-color", buttonBackground);
  const bounds = await page.evaluate(() => {
    const header = document.querySelector(".topbar")!.getBoundingClientRect();
    const words = document.querySelector(".word-list")!.getBoundingClientRect();
    const puzzle = document.querySelector(".puzzle-grid")!.getBoundingClientRect();
    const footer = document.querySelector(".game-footer")!.getBoundingClientRect();
    const timer = document.querySelector(".game-footer .timer")!.getBoundingClientRect();
    return {
      headerBottom: header.bottom,
      wordsTop: words.top,
      wordsBottom: words.bottom,
      puzzleTop: puzzle.top,
      puzzleBottom: puzzle.bottom,
      footerTop: footer.top,
      viewportHeight: window.innerHeight,
      centerOffset: (words.top + puzzle.bottom) / 2 - (header.bottom + footer.top) / 2,
      timerRightOffset: timer.right - footer.right,
    };
  });
  expect(bounds.headerBottom).toBeLessThan(bounds.wordsTop);
  expect(bounds.wordsBottom).toBeLessThan(bounds.puzzleTop);
  expect(bounds.puzzleBottom).toBeLessThan(bounds.footerTop);
  expect(bounds.footerTop).toBeLessThan(bounds.viewportHeight);
  expect(Math.abs(bounds.centerOffset)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.timerRightOffset)).toBeLessThanOrEqual(1);
  await context.close();
});

test("scrolls newly completed history entries into view on a short phone", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    screen: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await enterGame(page);
  for (let completed = 0; completed < 3; completed += 1) {
    await solveCurrentPuzzle(page);
    await page.getByRole("button", { name: /Next puzzle/ }).click();
    await page.locator(".puzzle-grid").waitFor();
  }
  await page.getByRole("button", { name: "Open history" }).click();
  const dialog = page.getByRole("dialog", { name: "History" });
  const historyList = page.locator(".history-list");
  const lastEntry = page.locator(".history-list li").last();
  await expect(dialog).toBeVisible();
  expect(await historyList.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await historyList.hover();
  await page.mouse.wheel(0, 1_000);
  await expect.poll(async () => {
    const listBox = await historyList.boundingBox();
    const entryBox = await lastEntry.boundingBox();
    return listBox !== null && entryBox !== null && entryBox.y + entryBox.height <= listBox.y + listBox.height + 1;
  }).toBe(true);
  await context.close();
});

test("uses the screen only at creation and keeps a resumed board unchanged", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, screen: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await enterGame(page);
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^18 by 12/);
  const letters = await page.locator(".puzzle-cell").allTextContents();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^18 by 12/);
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
  await page.reload();
  await enterGame(page, false);
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^18 by 12/);
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
  await context.close();
});

test("blocks unsupported mobile landscape orientation", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Turn your device")).toBeVisible();
  await expect(page.getByText("This puzzle is designed for portrait play.")).toBeVisible();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("word-search-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("state").objectStore("state").get("active-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  })).toBeUndefined();
  await context.close();
});

test("waits for tablet landscape before generating its first puzzle", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 834, height: 1112 },
    screen: { width: 834, height: 1194 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Turn your device")).toBeVisible();
  await expect(page.getByText("This puzzle is designed for landscape play.")).toBeVisible();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("word-search-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("state").objectStore("state").get("active-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  })).toBeUndefined();

  await page.setViewportSize({ width: 1112, height: 834 });
  await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
  await page.getByRole("button", { name: "New Game" }).click();
  await expect(page.locator(".puzzle-grid")).toBeVisible();
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^16 by 11/);
  const letters = await page.locator(".puzzle-cell").allTextContents();
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(page.getByText("Turn your device")).toBeVisible();
  await page.setViewportSize({ width: 1112, height: 834 });
  await expect(page.locator(".puzzle-grid")).toBeVisible();
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
  await context.close();
});

test("uses the desktop-style layout when a tablet starts in landscape", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1194, height: 834 },
    screen: { width: 1194, height: 834 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await enterGame(page);
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^17 by 11/);
  await expect(page.getByText("Turn your device")).not.toBeVisible();
  await context.close();
});

test("exposes console-only word highlighting in both color modes", async ({ page }) => {
  await enterGame(page);
  await page.evaluate(() => window.wordSearchDebug?.highlightWords());
  const highlighted = page.locator(".puzzle-cell.is-debug");
  await expect(highlighted.first()).toHaveCSS("background-color", "rgb(119, 122, 125)");
  expect(await highlighted.count()).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Toggle color mode" }).click();
  await expect(highlighted.first()).toHaveCSS("background-color", "rgb(160, 163, 166)");
  await page.evaluate(() => window.wordSearchDebug?.hideWords());
  await expect(highlighted).toHaveCount(0);
});

test("loads a requested theme through the console debug API", async ({ page }) => {
  await enterGame(page);
  expect(await page.evaluate(() => window.wordSearchDebug?.loadTheme("nature-essentials"))).toBe("nature-essentials");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nature");
  await expect(page.locator(".word-chip")).toHaveCount(6);
});

test("can cancel reset or erase all application state", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await enterGame(page);
  await page.getByRole("button", { name: "Toggle color mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("word-search-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("history", "readwrite");
      transaction.objectStore("history").put({ id: "reset-test-history", completedAt: new Date().toISOString() });
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.getByRole("button", { name: "Reset progress" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "What would you like to reset?" })).not.toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Reset progress" }).click();
  await page.getByRole("button", { name: "Reset everything" }).click();
  await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("word-search-game"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(["state", "history"], "readonly");
    const stateKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = transaction.objectStore("state").getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const historyCount = await new Promise<number>((resolve, reject) => {
      const request = transaction.objectStore("history").count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return { stateKeys, historyCount };
  })).toEqual({ stateKeys: [], historyCount: 0 });
});
