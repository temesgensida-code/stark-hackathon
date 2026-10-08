import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { removePaper, seedPaper } from "./helpers";

let paperId = 0;
test.beforeAll(async ({ request }) => {
  paperId = await seedPaper(request);
});
test.afterAll(async ({ request }) => {
  await removePaper(request, paperId);
});

for (const [name, url] of [
  ["home", () => "/"],
  ["reader", () => `/papers/${paperId}`],
  ["notes", () => `/notes?paper=${paperId}`],
  ["Braille settings", () => "/settings/braille"],
] as const) {
  test(`axe: ${name} has no serious or critical violations`, async ({ page }) => {
    await page.goto(url());
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const detail = (v: (typeof bad)[number]) =>
      v.nodes.slice(0, 4).map((n) => `${n.target} ${JSON.stringify((n.any[0]?.data as object) ?? {}).slice(0, 160)}`);
    expect(bad.map((v) => ({ id: v.id, nodes: v.nodes.length, examples: detail(v) }))).toEqual([]);
  });
}
