import { defineConfig } from "@playwright/test";

// Runs against a running stack: `docker compose up -d` (API) and `npm run build && npm run start` (web).
// Uses the Microsoft Edge that ships with Windows, so no browser download is needed.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: { baseURL: process.env.WEB_URL ?? "http://localhost:3000", channel: "msedge", headless: true },
});
