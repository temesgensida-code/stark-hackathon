import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Uploads the sample PDF and waits until it is parsed. Returns the paper id. */
export async function seedPaper(request: APIRequestContext): Promise<number> {
  const res = await request.post("/api/documents", {
    multipart: { file: { name: "sample.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(fileURLToPath(new URL("./fixtures/sample.pdf", import.meta.url))) } },
  });
  expect(res.status()).toBe(202);
  const { paper_id } = await res.json();
  await expect
    .poll(async () => (await (await request.get(`/api/documents/${paper_id}/status`)).json()).status, { timeout: 30_000 })
    .toBe("ready");
  return paper_id;
}

/** Opens the reader and the virtual display dock; waits for the display to be connected. */
export async function openReader(page: Page, paperId: number) {
  await page.goto(`/papers/${paperId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /show virtual braille display/i }).click();
  await expect(page.getByRole("button", { name: "Route cursor to cell 1", exact: true })).toBeVisible();
}

/** Removes a paper created by seedPaper so test runs do not pile up in the user's paper list. */
export async function removePaper(request: APIRequestContext, paperId: number) {
  if (paperId) await request.delete(`/api/papers/${paperId}`);
}
