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
  await expect(page.locator(".queue")).toBeVisible();
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
  await expect(page.locator(".queue")).toBeVisible();
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
  await expect(page.locator(".queue")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/desk-storm.png" });
});

test("screenshot: live-finale", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [CH5_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await expect(page.locator(".queue")).toBeVisible();
  // Click the plant recon case (the main critical case)
  await page.locator(".ticket-card:not(.done):not(.side)").first().click();
  // Click through the briefing dialogue
  for (let i = 0; i < 50; i++) {
    const vn = page.locator(".vn[role=button]");
    if (await vn.count()) {
      await vn.click();
      continue;
    }
    if (await page.locator(".live-clock").count()) break;
    if (await page.locator(".ws-title").count()) break;
    await page.waitForTimeout(100);
  }
  // The live case should show the workspace with a ticking clock
  await expect(page.locator(".ws-title")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/live-finale.png" });
});

test("screenshot: tool-siem", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [CH5_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await expect(page.locator(".queue")).toBeVisible();
  // Click the plant recon case
  await page.locator(".ticket-card:not(.done):not(.side)").first().click();
  // Click through the briefing dialogue
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
  // Click the SIEM evidence tab
  await page.locator("[data-ev='ev_plant_logins']").click();
  await expect(page.locator(".siem-input")).toBeVisible();
  // Type a search query
  await page.locator(".siem-input").fill("account=lh-admin geo=External");
  await page.locator(".siem-input").press("Enter");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/tool-siem.png" });
});
