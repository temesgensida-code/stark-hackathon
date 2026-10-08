import { expect, test } from "@playwright/test";
import { openReader, removePaper, seedPaper } from "./helpers";

let paperId = 0;
test.beforeAll(async ({ request }) => {
  paperId = await seedPaper(request);
});
test.afterAll(async ({ request }) => {
  await removePaper(request, paperId);
});

const caretText = (page: import("@playwright/test").Page) => page.locator("mark[title='Braille caret']").first().innerText();

test("a routing key on the display moves the caret in the text", async ({ page }) => {
  await openReader(page, paperId);
  await page.getByRole("button", { name: "Next", exact: true }).click(); // a section with body text
  const before = await page.locator("section.section-view p").first().innerText();
  await page.getByRole("button", { name: "Route cursor to cell 10" }).click();
  await expect(page.locator("mark[title='Braille caret']")).toBeVisible();
  const marked = await caretText(page);
  expect(before).toContain(marked);
  const first = await page.locator("mark[title='Braille caret']").evaluate((el) => (el.previousSibling as HTMLElement | null)?.textContent?.length ?? 0);
  await page.getByRole("button", { name: "Route cursor to cell 20" }).click();
  const second = await page.locator("mark[title='Braille caret']").evaluate((el) => (el.previousSibling as HTMLElement | null)?.textContent?.length ?? 0);
  expect(second).toBeGreaterThan(first);
});

test("the next-section key on the display changes the section", async ({ page }) => {
  await openReader(page, paperId);
  const heading = () => page.locator("#section-heading").innerText();
  const start = await heading();
  await page.getByTitle("Line Down / Next Section").first().click();
  await expect.poll(heading).not.toBe(start);
});

test("typing a chord on the display goes into the focused note", async ({ page }) => {
  await openReader(page, paperId);
  const note = page.getByLabel("Note", { exact: true });
  await note.focus();
  // dots 1-2-5 is "h" in UEB; the Space key commits the word
  for (const dot of ["1", "2", "5"]) await page.getByTitle(`Toggle Dot ${dot} (Key`).first().click();
  await page.getByTitle(/Space \/ Commit Word/).first().click();
  await expect(note).toHaveValue(/\S/);
});

test("J and K move sections, but not while display key capture is on", async ({ page }) => {
  await openReader(page, paperId);
  const heading = () => page.locator("#section-heading").innerText();
  const start = await heading();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("j");
  await expect.poll(heading).not.toBe(start);
  const moved = await heading();
  await page.getByLabel(/Keyboard Hotkeys/).check();
  await expect.poll(() => page.evaluate(() => document.body.dataset.brailleCapture)).toBe("on");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("k"); // a chord key now, not "previous section"
  expect(await heading()).toBe(moved);
});

test("the language picker switches the Braille code and is remembered", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Language").selectOption("am");
  await page.goto("/settings/braille");
  await expect(page.getByLabel("Braille code")).toHaveValue("am-g1");
  await page.getByLabel("Language").selectOption("en");
  await expect(page.getByLabel("Braille code")).toHaveValue("en-ueb-g2");
});

test("a section downloads as a BRF file", async ({ page }) => {
  await openReader(page, paperId);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /download section as brf/i }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.brf$/);
});
