import { test, expect } from "@playwright/test";

const GAME = new URL("../dist/index.html", import.meta.url).href;
const META = JSON.stringify({
  version: 1, endings: [], achievements: [], codexEver: [], casesEver: [],
  secretsEver: [], checkpoints: {},
  settings: { music: 0, effects: 0, muted: true, textScale: 1, reducedMotion: true, relaxedTimers: false },
});

// Chapter 1: player just arrived at the desk after being hired, two tickets visible
const CH1_SAVE = JSON.stringify({
  version: 1, playerName: "Riley", track: "forensics", hired: true,
  chapter: 1, xp: 0, integrity: 2,
  flags: ["track_forensics", "hired", "intro_1"],
  done: ["intro_1"], codex: [], screeningScore: 5,
  cleanCloses: 0, totalCloses: 0, botched: 0,
  screeningFails: 0, hintsUsed: 0, hard: false, seed: 42,
});

// Chapter 5: SOC analyst arriving at the storm desk
const CH5_SAVE = JSON.stringify({
  version: 1, playerName: "Riley", track: "soc", hired: true,
  chapter: 5, xp: 600, integrity: 4,
  flags: ["track_soc", "knows_truth", "knows_harborwatch", "evidence_chain_intact", "intro_5"],
  done: ["intro_5"], codex: [], screeningScore: 5,
  cleanCloses: 8, totalCloses: 8, botched: 0,
  screeningFails: 0, hintsUsed: 0, hard: false, seed: 42,
});

test("screenshot: desk-chapter1", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [CH1_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await expect(page.locator(".office-hub")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/desk-chapter1.png" });
});

test("screenshot: investigation", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [CH1_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await expect(page.locator(".office-hub")).toBeVisible();
  await page.locator(".hot-tickets").click();
  // Click the main phishing case
  await page.locator(".ticket-card:not(.done):not(.side)").first().click();
  // Wait for the briefing dialogue, click through it
  for (let i = 0; i < 30; i++) {
    const vn = page.locator(".vn[role=button]");
    if (await vn.count()) {
      await vn.click();
      continue;
    }
    if (await page.locator(".ws-title").count()) break;
    await page.waitForTimeout(100);
  }
  await expect(page.locator(".ws-title")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/investigation.png" });
});

test("screenshot: desk-storm", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [CH5_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await expect(page.locator(".office-hub")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/desk-storm.png" });
});

// The pictures in the README show the game without giving a case away: no
// answer typed in, no finale, and no alert already called.

test("screenshot: main-menu", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(GAME);
  await page.evaluate((m) => {
    localStorage.removeItem("breakwater.save.v1");
    localStorage.setItem("breakwater.meta.v1", m);
  }, META);
  await page.reload();
  await expect(page.locator(".main-menu")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/main-menu.png" });
});

// Chapter 2: at the desk with the terminal case open, and nothing solved
const CH2_SAVE = JSON.stringify({
  version: 1, playerName: "Riley", track: "network", hired: true,
  chapter: 2, xp: 60, integrity: 2,
  flags: ["track_network", "hired", "intro_2"],
  done: ["intro_1", "t1_bakery_phish", "s1_outro", "intro_2"], codex: ["phishing"], screeningScore: 5,
  cleanCloses: 1, totalCloses: 1, botched: 0,
  screeningFails: 0, hintsUsed: 0, hard: false, seed: 42, triage: {},
});

test("screenshot: desktop", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [CH2_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await page.locator(".hot-tickets").click();
  await page.locator(".ticket-card", { hasText: "lab PC" }).click();
  for (let i = 0; i < 50; i++) {
    const vn = page.locator(".vn[role=button]");
    if (await vn.count()) {
      await vn.click();
      continue;
    }
    if (await page.locator(".ws-title").count()) break;
    await page.waitForTimeout(100);
  }
  await expect(page.locator(".ws-title")).toBeVisible();
  // the tool in use, on a command that shows the file and not the answer
  const prompt = page.locator(".ev input").first();
  await prompt.fill("head -n 6 dns.log");
  await prompt.press("Enter");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/desktop.png" });
});

test("screenshot: alert-queue", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [CH2_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await page.locator(".alert-queue-open").click();
  await expect(page.locator(".triage-list")).toBeVisible();
  // the queue as it arrives: nothing opened, nothing called
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/alert-queue.png" });
});
