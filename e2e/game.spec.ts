import { expect, test } from "@playwright/test";

test("plays a complete puzzle and persists it to history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
    if (wordIndex === 0) {
      await page.mouse.click(first!.x + first!.width / 2, first!.y + first!.height / 2);
      await expect(page.locator(".puzzle-cell.is-active")).toHaveCount(0);
      await expect(page.locator(".game-footer")).toContainText("1 attempts");
    }
  }
  await expect(page.getByRole("dialog", { name: "Nicely found." })).toBeVisible();
  await page.getByRole("button", { name: /Next puzzle/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ocean" })).toBeVisible();
  await page.getByRole("button", { name: "Open history" }).click();
  await expect(page.getByRole("dialog", { name: "History" })).toContainText("Nature");
});

test("rolls an incorrect selection back cell by cell", async ({ page }) => {
  await page.goto("/");
  await page.locator(".puzzle-grid").waitFor();
  const first = await page.locator('[data-x="1"][data-y="1"]').boundingBox();
  const second = await page.locator('[data-x="2"][data-y="1"]').boundingBox();
  await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(second!.x + second!.width / 2, second!.y + second!.height / 2, { steps: 3 });
  await expect(page.locator('.puzzle-cell.is-active').first()).toHaveCSS("background-color", "rgb(22, 138, 173)");
  await page.mouse.up();
  await expect(page.locator(".puzzle-grid")).toHaveClass(/is-locked/);
  await expect(page.locator(".puzzle-cell.is-active")).toHaveCount(0);
  await expect(page.locator(".puzzle-grid")).not.toHaveClass(/is-locked/);
  await expect(page.locator(".game-footer")).toContainText("1 attempts");
  const letters = await page.locator(".puzzle-cell").allTextContents();
  await page.getByRole("button", { name: "Reset progress" }).click();
  await expect(page.getByRole("dialog", { name: "What would you like to reset?" })).toBeVisible();
  await page.getByRole("button", { name: "Reset current board" }).click();
  await expect(page.locator(".game-footer")).toContainText("0 attempts");
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
});

test("fits the page and toggles from system dark mode on the first click", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.locator(".puzzle-grid").waitFor();
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth - document.documentElement.clientWidth, height: document.documentElement.scrollHeight - document.documentElement.clientHeight }))).toEqual({ width: 0, height: 0 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Toggle color mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".puzzle-grid")).toHaveCSS("cursor", "default");
  const cell = await page.locator(".puzzle-cell").first().boundingBox();
  expect(cell!.width).toBeGreaterThanOrEqual(44);
  expect(cell!.height).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat(await page.locator(".puzzle-cell").first().evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  const spacing = await page.evaluate(() => {
    const header = document.querySelector(".topbar")!.getBoundingClientRect();
    const words = document.querySelector(".word-list")!.getBoundingClientRect();
    const grid = document.querySelector(".puzzle-grid")!.getBoundingClientRect();
    const footer = document.querySelector(".game-footer")!.getBoundingClientRect();
    const content = document.querySelector(".puzzle-content")!.getBoundingClientRect();
    return {
      headerToWords: words.top - header.bottom,
      wordsToGrid: grid.top - words.bottom,
      centerOffset: (content.top + content.bottom) / 2 - (header.bottom + footer.top) / 2,
    };
  });
  expect(spacing.headerToWords).toBeGreaterThan(spacing.wordsToGrid);
  expect(Math.abs(spacing.centerOffset)).toBeLessThanOrEqual(1);
});

test("keeps a generated board unchanged across resizing and mobile orientation", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, screen: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^18 by 12/);
  const letters = await page.locator(".puzzle-cell").allTextContents();
  await page.waitForTimeout(100);
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 3, mobile: true });
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^18 by 12/);
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
  await page.reload();
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^18 by 12/);
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 956, height: 440, screenWidth: 956, screenHeight: 440, deviceScaleFactor: 3, mobile: true });
  await expect(page.getByText("Turn your device")).toBeVisible();
  await expect(page.locator(".puzzle-grid")).toHaveAttribute("aria-label", /^18 by 12/);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 440, height: 956, screenWidth: 440, screenHeight: 956, deviceScaleFactor: 3, mobile: true });
  await expect(page.getByText("Turn your device")).not.toBeVisible();
  expect(await page.locator(".puzzle-cell").allTextContents()).toEqual(letters);
  await context.close();
});

test("exposes console-only word highlighting in both color modes", async ({ page }) => {
  await page.goto("/");
  await page.locator(".puzzle-grid").waitFor();
  await page.evaluate(() => window.wordSearchDebug?.highlightWords());
  const highlighted = page.locator(".puzzle-cell.is-debug");
  await expect(highlighted.first()).toHaveCSS("background-color", "rgb(119, 122, 125)");
  expect(await highlighted.count()).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Toggle color mode" }).click();
  await expect(highlighted.first()).toHaveCSS("background-color", "rgb(160, 163, 166)");
  await page.evaluate(() => window.wordSearchDebug?.hideWords());
  await expect(highlighted).toHaveCount(0);
});

test("can cancel reset or erase all application state", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.locator(".puzzle-grid").waitFor();
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
  await expect(page.getByRole("heading", { level: 1, name: "Nature" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".game-footer")).toContainText("0 attempts");
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
  })).toEqual({ stateKeys: ["active-game"], historyCount: 0 });
});
