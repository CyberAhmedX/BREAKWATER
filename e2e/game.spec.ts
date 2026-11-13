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
  // The longest test by far: a whole game, then four partial replays. The
  // limit is set for a slow shared CI machine, not for a laptop.
  test.setTimeout(25 * 60_000);
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

  // the skills summary lists what this run really did, and downloads as one page
  await page.getByRole("button", { name: "Skills summary" }).click();
  await expect(page.locator(".skills-tools li")).not.toHaveCount(0);
  await expect(page.locator(".skills-tools")).toContainText("Timelines across time zones");
  await expect(page.locator(".skills-tools")).toContainText("Two copies, two fingerprints");
  await expect(page.locator(".skills-stats")).toContainText("8 of 8");
  const [skills] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download as a page" }).click()]);
  expect(skills.suggestedFilename()).toBe("breakwater-skills-Riley.html");
  const skillsPath = test.info().outputPath("skills.html");
  await skills.saveAs(skillsPath);
  // open the saved page on its own: it stands alone, with no scripts and no links out
  const view = await page.context().newPage();
  const requests: string[] = [];
  view.on("request", (r) => requests.push(r.url()));
  await view.goto(new URL(skillsPath, "file://").href);
  await expect(view.locator("h1")).toHaveText("Riley");
  await expect(view.locator("dl")).toContainText("The Lighthouse");
  await expect(view.locator("footer")).toContainText("not a certificate");
  await expect(view.locator("script, link, img, a")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await view.close();
  await page.locator(".overlay-close").click();

  // the forensics secret, found during the clean run, is recorded
  expect((await save(page)).flags).toContain("secret_forensics");

  const clean = await meta(page);
  for (const id of ["first_try", "chain", "lead", "by_the_book", "clean_hands", "no_hints", "side_work", "signal"]) {
    expect(clean.achievements, id).toContain(id);
  }

  // Break the chain of custody in chapter three and report anyway.
  await replayChapter(page, "Chapter Three");
  expect(await play(page, { ...base, decisions: { q_clinic_walter: 1 } })).toBe(ENDINGS.crackedlens.title);

  // This run took BRACKISH's message to Mags and turned Walter down, so she
  // will still take the evidence in the last chapter.
  await replayChapter(page, "Chapter Five");
  expect(await play(page, { ...base, scenes: { s5_evidence: 1 } })).toBe(ENDINGS.lowtide.title);
  // Keeping it inside the company is closed while Mags holds that message,
  // unless you go back and take Walter's promotion in chapter four.
  await replayChapter(page, "Chapter Four");
  expect(await play(page, { ...base, scenes: { s4_walter_offer: 0, s5_evidence: 2 } })).toBe(ENDINGS.keeper.title);
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

// Settings for the runs below that are not about dialogue or motion: quiet,
// still, and each conversation shown at once, so a run is mostly casework.
const QUICK_META = { version: 1, endings: [], achievements: [], codexEver: [], casesEver: [], secretsEver: [], checkpoints: {}, settings: { music: 0, effects: 0, muted: true, textScale: 1, reducedMotion: true, relaxedTimers: false, fastDialogue: true } };

/** Start the game from a save, or from nothing, with the quick settings. */
async function startQuick(page: Page, saveData?: Record<string, unknown>): Promise<void> {
  await page.goto(GAME);
  await page.evaluate(
    ([s, m]) => {
      if (s) localStorage.setItem("breakwater.save.v1", s);
      else localStorage.removeItem("breakwater.save.v1");
      localStorage.setItem("breakwater.meta.v1", m);
    },
    [saveData ? JSON.stringify(saveData) : "", JSON.stringify(QUICK_META)],
  );
  await page.reload();
}

// One test per team for each stretch of the game, so each has its own clock
// and they can run side by side.
for (const dept of DEPTS) {
  test(`the ${DEPT_LABEL[dept]} hire gets their own case, nobody else's, and finds their team's secret`, async ({ page }) => {
    test.setTimeout(6 * 60_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await startQuick(page);
    // through the screening and the first three chapters
    expect(await play(page, { name: "Sam", track: dept, untilChapter: 4 })).toBeNull();
    const s = await save(page);
    const own = TICKETS.find((t) => t.requires?.includes(trackFlag(dept)) && t.chapter === 2)!;
    const otherCh2 = TICKETS.filter((t) => t.chapter === 2 && t.requires?.some((f) => f.startsWith("track_")) && t !== own);
    expect(s.done).toContain(own.id);
    for (const t of otherCh2) expect(s.done).not.toContain(t.id);
    expect(s.flags, `${dept} finds its chapter-three secret`).toContain(`secret_${dept}`);
    expect(errors).toEqual([]);
  });
}

const OWN_CH4: Record<string, string> = { soc: "t4_soc", network: "t4_network", helpdesk: "t4_helpdesk", forensics: "t4_forensics", pentest: "t4_harbor_pentest", intel: "t4_intel_correlate" };

for (const track of DEPTS) {
  test(`the ${DEPT_LABEL[track]} hire works their chapter four case with their own tool`, async ({ page }) => {
    test.setTimeout(5 * 60_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await startQuick(page, { version: 1, playerName: "Four", track, hired: true, chapter: 4, xp: 400, integrity: 3, flags: [`track_${track}`, "knows_truth", "knows_harborwatch", "clinic_examined", "evidence_chain_intact", "told_mags"], done: [], codex: [], screeningScore: 5, cleanCloses: 6, totalCloses: 6, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false, seed: 20261110, triage: {} });
    expect(await play(page, { name: "Four", track, untilChapter: 5 })).toBeNull();
    const s = await save(page);
    expect(s.done, `${track} closed its own case`).toContain(OWN_CH4[track]);
    // the principled choice everywhere: nobody crossed the line
    expect(s.flags).not.toContain("crossed_line");
    expect(s.flags).toEqual(expect.arrayContaining(["triage_caught:q4_shadow", "triage_caught:q4_device"]));
    expect(errors).toEqual([]);
  });
}

// SOC's finale has a test of its own below, and Forensics plays its finale in the full run.
for (const track of ["network", "helpdesk", "pentest", "intel"] as const) {
  test(`the ${DEPT_LABEL[track]} hire plays their own live finale to an ending`, async ({ page }) => {
    test.setTimeout(5 * 60_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // no seed and no alert queue in this save, as one written by an older version would have
    await startQuick(page, { version: 1, playerName: "Fin", track, hired: true, chapter: 5, xp: 650, integrity: 4, flags: [`track_${track}`, "knows_truth", "knows_harborwatch", "evidence_chain_intact", "intro_5"], done: ["intro_5"], codex: [], screeningScore: 5, cleanCloses: 9, totalCloses: 9, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false });
    const ending = await play(page, { name: "Fin", track });
    expect(ending, `${track} reaches an ending`).not.toBeNull();
    expect(errors).toEqual([]);
  });
}

test("an ending closed by an earlier choice is shown with the reason", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const at = async (flags: string[]): Promise<void> => {
    await page.goto(GAME);
    await page.evaluate((f) => {
      localStorage.setItem("breakwater.save.v1", JSON.stringify({ version: 1, playerName: "Gate", track: "soc", hired: true, chapter: 5, xp: 600, integrity: 4, flags: ["track_soc", "knows_truth", "finale_ready", "finale_contained", "intro_5", ...f], done: ["intro_5", "t5_plant_recon", "s5_contain"], codex: [], screeningScore: 5, cleanCloses: 9, totalCloses: 9, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false, seed: 7, triage: Object.fromEntries(["q5_ups", "q5_payroll", "q5_door", "q5_dns", "q5_factor"].map((id) => [id, "aged"])) }));
      localStorage.setItem("breakwater.meta.v1", JSON.stringify({ version: 1, endings: [], achievements: [], codexEver: [], casesEver: [], secretsEver: [], checkpoints: {}, settings: { music: 0, effects: 0, muted: true, textScale: 1, reducedMotion: true, relaxedTimers: false, fastDialogue: true } }));
    }, flags);
    await page.reload();
    await page.getByRole("button", { name: /^Continue as/ }).click();
    await page.locator(".desk-footer .btn.primary").click();
    while (await page.locator(".vn[role=button]").count()) await page.locator(".vn[role=button]").click();
    await expect(page.locator(".vn-choice-prompt")).toHaveText("What do you do with the evidence?");
  };
  const open = page.locator(".vn-choice .btn.choice:not(.locked)");
  const closed = page.locator(".vn-choice .btn.choice.locked");

  // took her message to Mags, turned Walter down: the cover-up is closed
  await at(["told_mags"]);
  await expect(open).toHaveCount(2);
  await expect(closed).toHaveCount(1);
  await expect(closed).toContainText("keep the St. Brennan's link inside the company");
  await expect(closed.locator(".choice-lock")).toContainText("Mags");
  await expect(closed).toBeDisabled();

  // handed her to Walter: she will not take the evidence
  await at(["told_walter_about_message"]);
  await expect(open).toHaveCount(2);
  await expect(closed).toContainText("Give the evidence to BRACKISH");
  await expect(closed.locator(".choice-lock")).toContainText("chapter three");

  // heard her out and turned Walter down: everything is on the table
  await at(["trusted_nadia"]);
  await expect(open).toHaveCount(3);
  await expect(closed).toHaveCount(0);
});

test("alerts left to age out, and alerts caught, come back in the next chapter", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // the end of chapter two for a help desk hire, with every case closed and the queue untouched
  const start = async (): Promise<void> => {
    await page.goto(GAME);
    await page.evaluate(() => {
      localStorage.setItem("breakwater.save.v1", JSON.stringify({ version: 1, playerName: "Queue", track: "helpdesk", hired: true, chapter: 2, xp: 300, integrity: 1, flags: ["track_helpdesk", "seen_brightloaf"], done: ["intro_1", "t1_bakery_phish", "s1_outro", "intro_2", "t2_bakery_bec", "t2_school_dns", "tr_helpdesk"], codex: [], screeningScore: 5, cleanCloses: 4, totalCloses: 4, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false, seed: 3, triage: {} }));
      localStorage.setItem("breakwater.meta.v1", JSON.stringify({ version: 1, endings: [], achievements: [], codexEver: [], casesEver: [], secretsEver: [], checkpoints: {}, settings: { music: 0, effects: 0, muted: true, textScale: 1, reducedMotion: true, relaxedTimers: false, fastDialogue: true } }));
    });
    await page.reload();
    await page.getByRole("button", { name: /^Continue as/ }).click();
    await expect(page.locator(".alert-panel-note")).toContainText("5 alerts waiting, and time to open 3");
  };
  // the opening scene of chapter three, laid out at once by fast dialogue
  const nextMorning = async (): Promise<string> => {
    await expect(page.locator(".vn-text").first()).toContainText("Two of your cases this week");
    await page.locator(".vn[role=button]").click();
    await expect(page.locator(".vn-text").first()).toContainText("Rain at last");
    return page.locator(".vn").innerText();
  };
  const cont = page.locator(".desk-footer .btn.primary");

  // leave the whole queue: the game asks once, then lets the day end
  await start();
  await cont.click();
  await expect(cont).toContainText("Alerts are still waiting");
  await cont.click();
  let morning = await nextMorning();
  expect(morning).toContain("The harbormaster's mailbox was read from the other side of the world");
  expect(morning).toContain("It aged out.");
  let s = await save(page);
  expect(s.flags).toEqual(expect.arrayContaining(["triage_missed:q2_travel", "triage_missed:q2_admin"]));

  // catch both real ones: no warning on the way out, and the morning goes differently
  await start();
  await page.locator(".alert-queue-open").click();
  for (const id of ["q2_travel", "q2_admin"]) {
    await page.locator(`.alert[data-alert="${id}"] .al-open`).click();
    await page.locator(`.alert[data-alert="${id}"] .al-escalate`).click();
    await expect(page.locator(`.alert[data-alert="${id}"] .explain.good`)).toContainText("Right call");
  }
  // the third look goes on a loud one, called wrongly
  await page.locator('.alert[data-alert="q2_backup"] .al-open').click();
  await expect(page.locator(".alert .al-open").first()).toBeDisabled();
  await page.locator('.alert[data-alert="q2_backup"] .al-escalate').click();
  await expect(page.locator('.alert[data-alert="q2_backup"] .explain.bad')).toContainText("Wrong call");
  await page.getByRole("button", { name: "Back to the desk" }).click();
  await expect(page.locator(".alert-panel-note")).toContainText("2 of 3 calls right");
  await cont.click();
  morning = await nextMorning();
  expect(morning).toContain("Theo reset it before they had read a single message");
  expect(morning).toContain("The technician sends biscuits.");
  expect(morning).not.toContain("aged out");
  s = await save(page);
  expect(s.flags).toEqual(expect.arrayContaining(["triage_caught:q2_travel", "triage_caught:q2_admin"]));
  expect(errors).toEqual([]);
});

test("the chapter five finale runs live and hands out take-home files", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto(GAME);
  await page.evaluate(() => {
    localStorage.setItem("breakwater.save.v1", JSON.stringify({ version: 1, playerName: "Nz", track: "soc", hired: true, chapter: 5, xp: 600, integrity: 4, flags: ["track_soc", "finale_ready", "intro_5"], done: ["intro_5"], codex: [], screeningScore: 5, cleanCloses: 8, totalCloses: 8, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false }));
  });
  await page.reload();
  await page.getByRole("button", { name: /^Continue as/ }).click();
  await page.locator(".hot-tickets").click();
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
  test.setTimeout(5 * 60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(GAME);
  await page.getByRole("button", { name: "New game" }).click();
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
  test.setTimeout(5 * 60_000);
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

test("the main menu can be reached from a running game, and the run carries on from it", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startQuick(page, { version: 1, playerName: "Menu", track: "soc", hired: true, chapter: 2, xp: 60, integrity: 2, flags: ["track_soc", "intro_2"], done: ["intro_2"], codex: [], screeningScore: 5, cleanCloses: 1, totalCloses: 1, botched: 0, screeningFails: 0, hintsUsed: 0, hard: false, seed: 42, triage: {} });
  // no way back to the menu is offered on the menu itself
  await expect(page.getByRole("button", { name: "Main menu" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue as Menu" }).click();
  await expect(page.locator(".office-hub")).toBeVisible();

  // from the office
  await page.getByRole("button", { name: "Main menu" }).click();
  await expect(page.locator(".main-menu")).toBeVisible();
  await page.getByRole("button", { name: "Continue as Menu" }).click();
  await expect(page.locator(".office-hub")).toBeVisible();

  // and from the middle of a case
  await page.locator(".hot-tickets").click();
  await page.locator(".ticket-card:not(.done)").first().click();
  await page.getByRole("button", { name: "Main menu" }).click();
  await expect(page.locator(".main-menu")).toBeVisible();
  expect((await save(page)).chapter).toBe(2);
  expect(errors).toEqual([]);
});
