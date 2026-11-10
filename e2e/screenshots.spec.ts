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

// Chapter 2: the alert queue, with one loud alert already called as noise and a quiet real one open
const QUEUE_SAVE = JSON.stringify({
  version: 1, playerName: "Riley", track: "soc", hired: true,
  chapter: 2, xp: 60, integrity: 1,
  flags: ["track_soc", "seen_brightloaf", "intro_2"],
  done: ["intro_1", "t1_bakery_phish", "s1_outro", "intro_2"], codex: ["phishing", "triage"], screeningScore: 5,
  cleanCloses: 1, totalCloses: 1, botched: 0,
  screeningFails: 0, hintsUsed: 0, hard: false, seed: 7,
  triage: { q2_backup: "closed", q2_travel: "opened" },
});

test("screenshot: alert-queue", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [QUEUE_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await page.locator(".alert-queue-open").click();
  await expect(page.locator(".alert.al-opened")).toBeVisible();
  // frame the list itself: the call already made, and the alert waiting for one
  await page.locator(".triage-list").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70));
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/alert-queue.png" });
});

// A SOC run near its end, for the skills summary
const SKILLS_SAVE = JSON.stringify({
  version: 1, playerName: "Riley", track: "soc", hired: true,
  chapter: 5, xp: 700, integrity: 5,
  flags: ["track_soc", "knows_truth", "knows_harborwatch", "evidence_chain_intact", "intro_5"],
  done: ["intro_5", "t1_bakery_phish", "t1_printer", "t2_bakery_bec", "t2_school_dns", "tr_soc", "sd_packet", "t3_clinic_image", "t3_soc_alerts", "sd_vishing", "t4_soc", "sd_backups", "t5_plant_recon"],
  codex: ["phishing", "email-headers", "dns-tunnel", "password-spray", "mfa", "triage", "detection-rule", "attack"], screeningScore: 5,
  cleanCloses: 11, totalCloses: 12, botched: 0,
  screeningFails: 0, hintsUsed: 1, hard: false, seed: 42,
  triage: { q2_travel: "escalated", q2_admin: "escalated", q2_backup: "closed", q2_eicar: "aged", q2_lockout: "aged", q3_avoff: "escalated", q3_upload: "aged", q3_cert: "closed", q3_scanner: "aged", q3_trip: "aged", q4_shadow: "escalated", q4_device: "escalated", q4_power: "closed", q4_vpn: "aged", q4_internet: "aged" },
});

test("screenshot: skills-summary", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto(GAME);
  await page.evaluate(([s, m]) => {
    localStorage.setItem("breakwater.save.v1", s);
    localStorage.setItem("breakwater.meta.v1", m);
  }, [SKILLS_SAVE, META]);
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Skills summary" }).click();
  await expect(page.locator(".skills-tools li").first()).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "media/skills-summary.png" });
});
