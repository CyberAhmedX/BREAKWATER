import { test, expect, type Page } from "@playwright/test";
import { play, save, meta, practiseCase, answerOne, type Plan } from "./bot";
import { ENDINGS } from "../src/engine/endings";
import { DEPTS, DEPT_LABEL } from "../src/engine/types";
import { TICKETS } from "../src/content/tickets";
import { trackFlag } from "../src/engine/state";

const GAME = new URL("../dist/index.html", import.meta.url).href;

async function replayChapter(page: Page, title: string): Promise<void> {
  await page.goto(GAME);
  await page.getByRole("button", { name: "Replay a chapter" }).click();
  await page.locator(".overlay-panel .btn.choice", { hasText: title }).click();
}

test("one full run, then every other ending through chapter select", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(GAME);

  // A clean run: right first time, no hints, every side case, the principled choice everywhere.
  const base: Plan = { name: "Riley", track: "forensics" };
  expect(await play(page, base)).toBe(ENDINGS.lighthouse.title);
  // the share card downloads as an image named for the ending
  await page.getByRole("button", { name: "Share card" }).click();
  await expect(page.locator(".share-img")).toBeVisible();
  const [card] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download image" }).click()]);
  expect(card.suggestedFilename()).toBe("breakwater-lighthouse-Riley.png");
  await page.locator(".overlay-close").click();

  // the forensics secret, found during the clean run, is recorded
  expect((await save(page)).flags).toContain("secret_forensics");

  const clean = await meta(page);
  for (const id of ["first_try", "chain", "lead", "by_the_book", "clean_hands", "no_hints", "side_work"]) {
    expect(clean.achievements, id).toContain(id);
  }

  // Break the chain of custody in chapter three and report anyway.
  await replayChapter(page, "Chapter Three");
  expect(await play(page, { ...base, decisions: { q_clinic_walter: 1 } })).toBe(ENDINGS.crackedlens.title);

  // The last chapter decides the rest.
  await replayChapter(page, "Chapter Five");
  expect(await play(page, { ...base, scenes: { s5_evidence: 1 } })).toBe(ENDINGS.lowtide.title);
  await replayChapter(page, "Chapter Five");
  expect(await play(page, { ...base, scenes: { s5_evidence: 2 } })).toBe(ENDINGS.keeper.title);
  await replayChapter(page, "Chapter Five");
  expect(await play(page, { ...base, scenes: { s5_contain: 1 } })).toBe(ENDINGS.deadwater.title);

  const all = await meta(page);
  expect([...all.endings].sort()).toEqual(Object.keys(ENDINGS).sort());
  expect(all.achievements).toContain("every_ending");

  // the gallery shows all five
  await page.getByRole("button", { name: "Endings and achievements" }).click();
  await expect(page.locator(".gal-item.seen")).toHaveCount(Object.keys(ENDINGS).length + all.achievements.length + (all.secretsEver?.length ?? 0));
  expect(errors).toEqual([]);
});

for (const dept of DEPTS) {
  test(`the ${DEPT_LABEL[dept]} hire gets their own case and nobody else's`, async ({ page }) => {
    test.setTimeout(2 * 60_000);
    await page.goto(GAME);
    expect(await play(page, { name: "Sam", track: dept, untilChapter: 3 })).toBeNull();
    const s = await save(page);
    const own = TICKETS.find((t) => t.requires?.includes(trackFlag(dept)) && t.chapter === 2)!;
    const otherCh2 = TICKETS.filter((t) => t.chapter === 2 && t.requires?.some((f) => f.startsWith("track_")) && t !== own);
    expect(s.done).toContain(own.id);
    for (const t of otherCh2) expect(s.done).not.toContain(t.id);
  });
}


test("each team finds its own chapter-three secret", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  for (const [track, flag] of [["helpdesk", "secret_helpdesk"], ["network", "secret_network"], ["intel", "secret_intel"], ["pentest", "secret_pentest"], ["soc", "secret_soc"]] as const) {
    await page.goto(GAME);
    await page.evaluate(() => { localStorage.removeItem("breakwater.save.v1"); localStorage.removeItem("breakwater.meta.v1"); });
    await page.reload();
    expect(await play(page, { name: "Sam", track, untilChapter: 4 })).toBeNull();
    const s = await save(page);
    expect(s.flags, `${track} sets ${flag}`).toContain(flag);
  }
});


test("each team plays its own live finale to an ending", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const track of ["network", "helpdesk", "pentest", "intel"] as const) {
    await page.goto(GAME);
    await page.evaluate((t) => {
      localStorage.setItem("breakwater.save.v1", JSON.stringify({ version: 1, playerName: "Fin", track: t, hired: true, chapter: 5, xp: 650, integrity: 4, flags: [`track_${t}`, "knows_truth", "knows_harborwatch", "evidence_chain_intact", "intro_5"], done: ["intro_5"], codex: [], screeningScore: 5, cleanCloses: 9, totalCloses: 9, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false }));
      localStorage.setItem("breakwater.meta.v1", JSON.stringify({ version: 1, endings: [], achievements: [], codexEver: [], casesEver: [], secretsEver: [], checkpoints: {}, settings: { music: 0, effects: 0, muted: true, textScale: 1, reducedMotion: true, relaxedTimers: false } }));
    }, track);
    await page.reload();
    const ending = await play(page, { name: "Fin", track });
    expect(ending, `${track} reaches an ending`).not.toBeNull();
  }
  expect(errors).toEqual([]);
});

test("the chapter five finale runs live and hands out take-home files", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(GAME);
  await page.evaluate(() => {
    localStorage.setItem("breakwater.save.v1", JSON.stringify({ version: 1, playerName: "Nz", track: "soc", hired: true, chapter: 5, xp: 600, integrity: 4, flags: ["track_soc", "finale_ready", "intro_5"], done: ["intro_5"], codex: [], screeningScore: 5, cleanCloses: 8, totalCloses: 8, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false }));
  });
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await page.locator(".ticket-card", { hasText: "Something is in the plant network" }).click();
  while (await page.locator(".vn[role=button]").count()) await page.locator(".vn[role=button]").click();
  await expect(page.locator(".live-clock")).toBeVisible();
  // the clock is ticking down
  const first = await page.locator(".live-time").innerText();
  await page.waitForTimeout(1100);
  expect(await page.locator(".live-time").innerText()).not.toBe(first);
  // solve it, then take home the block list
  const t = TICKETS.find((x) => x.id === "t5_plant_recon")!;
  const blocks = page.locator(".q-panel .q-block");
  for (let i = 0; i < t.questions.length; i++) await answerOne(page, blocks.nth(i), t.questions[i], t);
  await page.getByRole("button", { name: "Submit findings" }).click();
  await expect(page.locator(".ws-feedback .good-note")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Block list (.txt)" }).click()]);
  expect(dl.suggestedFilename()).toBe("harborwatch-block-list.txt");
});

test("hard mode never offers a hint, and practice leaves the run alone", async ({ page }) => {
  test.setTimeout(2 * 60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(GAME);
  await page.fill("#player-name", "Kit");
  await page.check("#hard-mode");
  await page.getByRole("button", { name: "Apply to Lanternhouse" }).click();
  expect(await play(page, { name: "Kit", track: "helpdesk", untilChapter: 2, hard: true })).toBeNull();
  const run = await page.evaluate(() => localStorage.getItem("breakwater.save.v1"));
  const s = await save(page);
  expect(s).toMatchObject({ hard: true, hintsUsed: 0, botched: 0 });

  // practise a case from chapter one twice, then check the run did not move
  await page.goto(GAME);
  await page.getByRole("button", { name: "Practice a case" }).click();
  const first = TICKETS.find((t) => t.id === "t1_bakery_phish")!;
  await practiseCase(page, first.title);
  await practiseCase(page, first.title);
  expect(await page.evaluate(() => localStorage.getItem("breakwater.save.v1"))).toBe(run);
  await page.locator(".overlay-close").click();
  await expect(page.getByRole("button", { name: "Continue as Kit" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a save moves to a fresh browser by file and by code", async ({ page, browser }) => {
  test.setTimeout(2 * 60_000);
  await page.goto(GAME);
  await play(page, { name: "Avery", track: "network", untilChapter: 2 });
  const before = await page.evaluate(() => ({
    save: localStorage.getItem("breakwater.save.v1"),
    meta: JSON.parse(localStorage.getItem("breakwater.meta.v1") ?? "{}"),
  }));

  // export both ways
  await page.goto(GAME);
  await page.getByRole("button", { name: /^Continue as / }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Export save" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download save file" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^breakwater-save-Avery-\d{4}-\d{2}-\d{2}\.json$/);
  const filePath = test.info().outputPath("save.json");
  await download.saveAs(filePath);
  const code = await page.getByLabel("Your save code").inputValue();
  expect(code.startsWith("BRKW1.")).toBe(true);

  const fresh = async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(GAME);
    await p.getByRole("button", { name: "Import a save" }).click();
    return { ctx, p };
  };
  const after = (p: Page) =>
    p.evaluate(() => ({
      save: localStorage.getItem("breakwater.save.v1"),
      meta: JSON.parse(localStorage.getItem("breakwater.meta.v1") ?? "{}"),
    }));

  // by file
  {
    const { ctx, p } = await fresh();
    await p.locator("#save-file").setInputFiles(filePath);
    await expect(p.locator(".overlay .stat-v").first()).toHaveText("Avery");
    await p.getByRole("button", { name: "Load this save" }).click();
    await expect(p.getByRole("button", { name: "Continue as Avery" })).toBeVisible();
    const got = await after(p);
    expect(got.save).toBe(before.save);
    expect(got.meta.checkpoints).toEqual(before.meta.checkpoints);
    await ctx.close();
  }

  // by code, pasted with a line break in the middle, after a bad paste first
  {
    const { ctx, p } = await fresh();
    await p.getByLabel("Save code").fill(code.slice(0, 200));
    await p.getByRole("button", { name: "Load code" }).click();
    await expect(p.locator(".transfer-error")).toContainText("damaged or cut short");
    await p.getByLabel("Save code").fill(`${code.slice(0, 300)}\n${code.slice(300)}`);
    await p.getByRole("button", { name: "Load code" }).click();
    await p.getByRole("button", { name: "Load this save" }).click();
    expect((await after(p)).save).toBe(before.save);
    // and it plays on from where it was: the start of chapter two
    await p.getByRole("button", { name: "Continue as Avery" }).click();
    await expect(p.locator(".vn-text")).toContainText("Overcast now.");
    await ctx.close();
  }
});
