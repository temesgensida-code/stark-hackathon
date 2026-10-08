import { expect, test, type Page } from "@playwright/test";
import { removePaper, seedPaper } from "./helpers";

let paperId = 0;
test.beforeAll(async ({ request }) => {
  paperId = await seedPaper(request);
});
test.afterAll(async ({ request }) => {
  await removePaper(request, paperId);
});

const status = (page: Page) => page.locator("main [role=status]").first();
const bar = (page: Page) => page.getByRole("region", { name: "Braille display" });

async function openDisplay(page: Page) {
  await page.getByRole("button", { name: "Show virtual Braille display" }).click();
  await expect(page.getByRole("button", { name: "Route cursor to cell 1", exact: true })).toBeVisible();
}

test("home: Enter alone on the display lists your papers; rocker moves; routing key opens", async ({ page }) => {
  await page.goto("/");
  await openDisplay(page);
  await expect(bar(page)).toContainText("Showing: search");
  await page.getByRole("button", { name: "↵ Enter" }).click();
  await expect(status(page)).toContainText(/^1 of \d+\./);
  await page.getByTitle("Line Down / Next Section").first().click();
  await expect(status(page)).toContainText(/^2 of \d+\./);
  await page.getByTitle("Line Up / Previous Section").first().click();
  await expect(status(page)).toContainText(/^1 of \d+\./);
  await page.getByRole("button", { name: "Route cursor to cell 3", exact: true }).click();
  await expect(page).toHaveURL(/\/papers\/\d+/);
});

test("home: typing a search on the Braille keys fills the search and Enter runs it", async ({ page }) => {
  await page.goto("/");
  await openDisplay(page);
  // p = dots 1-2-3-4, d = 1-4-5, f = 1-2-4 (none of them is a contraction on its own)
  for (const dots of [[1, 2, 3, 4], [1, 4, 5], [1, 2, 4]]) {
    for (const d of dots) await page.getByTitle(`Toggle Dot ${d} (Key`).first().click();
    await page.getByRole("button", { name: /^Commit \(/ }).click();
  }
  await page.getByTitle(/Space \/ Commit Word/).first().click();
  await expect(status(page)).toContainText(/^Search: pdf ?$/);
  await expect(page.getByLabel("Search papers")).toHaveValue(/^pdf ?$/);
  await page.getByRole("button", { name: "↵ Enter" }).click();
  await expect(status(page)).toContainText(/Searching for|papers found|No papers found|1 of/, { timeout: 30_000 });
});

test("notes: Show in Braille puts the note on the display and says so", async ({ page, request }) => {
  await request.post("/api/notes", { data: { paper_id: paperId, text: "Check the sample size", source: "keyboard" } });
  await page.goto(`/notes?paper=${paperId}`);
  await page.getByRole("button", { name: "Show in Braille" }).first().click();
  await expect(status(page)).toContainText(/On the Braille display: note: Check the sample size|No Braille display is connected/);
  await expect(bar(page)).toContainText("Showing: note");
  await expect(page.locator(".braille-cells")).toHaveText(/[⠁-⣿]/);
});

test("reader: Show in Braille announces the section", async ({ page }) => {
  await page.goto(`/papers/${paperId}`);
  await expect(page.locator("#section-heading")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show in Braille" }).click();
  await expect(status(page)).toContainText(/On the Braille display:|No Braille display is connected/);
  await expect(page.locator(".braille-cells")).toHaveText(/[⠁-⣿]/);
});
