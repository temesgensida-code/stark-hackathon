import { expect, test, type Page } from "@playwright/test";
import { openReader, removePaper, seedPaper } from "./helpers";

let paperId = 0;
test.beforeAll(async ({ request }) => {
  paperId = await seedPaper(request);
});
test.afterAll(async ({ request }) => {
  await removePaper(request, paperId);
});

const bar = (page: Page) => page.getByRole("region", { name: "Braille display" });
const status = (page: Page) => page.locator("main [role=status]").first();

/** Press dots on the virtual display, then either a command (Space + dots) or commit them as typing. */
async function press(page: Page, dots: number[], as: "command" | "typing") {
  for (const d of dots) await page.getByTitle(`Toggle Dot ${d} (Key`).first().click();
  if (as === "command") await page.getByRole("button", { name: "⌘ Space + dots" }).click();
  else await page.getByRole("button", { name: /^Commit \(/ }).click();
}

test("Space + L lists the commands on the display", async ({ page }) => {
  await openReader(page, paperId);
  await press(page, [1, 2, 3], "command");
  await expect(bar(page)).toContainText("Showing: commands");
});

test("Space + N, type, Enter saves a note from the display alone", async ({ page }) => {
  await openReader(page, paperId);
  await press(page, [1, 3, 4, 5], "command"); // n
  await expect(bar(page)).toContainText("Showing: write a note");
  await press(page, [1, 2, 3, 4], "typing"); // p
  await press(page, [1, 4, 5], "typing"); // d
  await press(page, [1, 2, 4], "typing"); // f
  await page.getByRole("button", { name: "↵ Enter" }).click();
  await expect(status(page)).toContainText(/^Note saved on /);
  await expect(bar(page)).toContainText("Showing: note saved");
  const notes = await (await page.request.get(`/api/notes?paper_id=${paperId}`)).json();
  expect(notes.at(-1)).toMatchObject({ text: "pdf", source: "braille" });
});

test("Space + Q starts a question; Space + R goes back to the text", async ({ page }) => {
  await openReader(page, paperId);
  await press(page, [1, 2, 3, 4, 5], "command"); // q
  await expect(bar(page)).toContainText("Showing: ask a question");
  await press(page, [1, 2, 3, 5], "command"); // r
  await expect(status(page)).toContainText(/On the Braille display:/);
});

test("Space + H goes home from any page", async ({ page }) => {
  await openReader(page, paperId);
  await press(page, [1, 2, 5], "command"); // h
  await expect(page).toHaveURL(/localhost:3000\/$/);
});
