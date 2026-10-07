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
  await page.mouse.up();
  await expect(page.locator(".puzzle-grid")).toHaveClass(/is-locked/);
  await expect(page.locator(".puzzle-cell.is-active")).toHaveCount(0);
  await expect(page.locator(".puzzle-grid")).not.toHaveClass(/is-locked/);
  await expect(page.locator(".game-footer")).toContainText("1 attempts");
});
