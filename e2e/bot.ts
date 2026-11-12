import { expect, type Locator, type Page } from "@playwright/test";
import type { Dept, Question, Ticket } from "../src/engine/types";
import { DEPT_LABEL } from "../src/engine/types";
import { TICKETS } from "../src/content/tickets";
import { withRunData } from "../src/content/vary";
import { SCENES } from "../src/content/scenes";
import { screeningFor } from "../src/content/screenings";
import { practicalFor } from "../src/content/practicals";
import { QUEUE } from "../src/content/queue";
import { checkScope } from "../src/engine/scope";
import { parseVector, METRICS } from "../src/engine/cvss";
import { defang } from "../src/engine/ioc";
import { LOCKOUT_PROOF } from "../src/engine/webapp";

// Plays Breakwater through the real UI, answering from the game's own content.
// Every graded answer is right on the first submit and no hint is bought; the
// plan only decides the choices that steer the story.

export interface Plan {
  name: string;
  track: Dept;
  // case decision id -> option index; default is the option with the most integrity
  decisions?: Record<string, number>;
  // scene id -> option index among all options; default is the most integrity on offer
  scenes?: Record<string, number>;
  // stop once the save reaches this chapter (6 means play to the ending)
  untilChapter?: number;
  // a hard mode run, which must never offer a hint
  hard?: boolean;
  // the alert queue: "catch" opens and escalates every real alert (the default),
  // "ignore" leaves the queue to age out, "wrong" closes the real ones
  triage?: "catch" | "ignore" | "wrong";
}

export async function save(page: Page): Promise<{ chapter: number; flags: string[]; done: string[]; seed: number; screeningFails: number }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("breakwater.save.v1") ?? "{}"));
}

export async function meta(page: Page): Promise<{ endings: string[]; achievements: string[]; secretsEver?: string[] }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("breakwater.meta.v1") ?? "{}"));
}

/** Elements matching selector whose whole text is exactly text. */
function withText(scope: Locator | Page, selector: string, text: string): Locator {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.locator(selector, { hasText: new RegExp(`^\\s*${escaped}\\s*$`) });
}

function best<T extends { integrity?: number }>(options: T[]): number {
  let at = 0;
  options.forEach((o, i) => {
    if ((o.integrity ?? 0) > (options[at].integrity ?? 0)) at = i;
  });
  return at;
}

/** Play from wherever the page is until the plan's chapter or the ending card. Returns the ending title, if reached. */
export async function play(page: Page, plan: Plan): Promise<string | null> {
  const until = plan.untilChapter ?? 6;
  for (let step = 0; step < 3000; step++) {
    if ((await page.locator(".ending-card").count()) > 0) return page.locator(".ending-title").innerText();
    if (until < 6 && (await save(page)).chapter >= until) return null;

    // dialogue: advance one line
    const vn = page.locator(".vn[role=button]");
    if (await vn.count()) {
      await vn.click();
      continue;
    }
    // a story choice at the end of a scene
    if (await page.locator(".vn-choice").count()) {
      await chooseInScene(page, plan);
      continue;
    }
    if (await page.locator(".main-menu").count()) {
      const cont = page.getByRole("button", { name: /^Continue as / });
      if (await cont.count()) await cont.click();
      else await page.getByRole("button", { name: "New game" }).click();
      continue;
    }
    if (await page.locator(".title-card").count()) {
      {
        await page.fill("#player-name", plan.name);
        await page.getByRole("button", { name: "Apply to Lanternhouse" }).click();
      }
      continue;
    }
    if (await page.locator(".track-grid").count()) {
      await page.locator(".track-card", { hasText: DEPT_LABEL[plan.track] }).click();
      continue;
    }
    if (await page.locator(".iv-card").count()) {
      await answerScreening(page, plan.track);
      continue;
    }
    if (await page.locator(".ws-title").count()) {
      await workCase(page, plan);
      continue;
    }
    if (await page.locator(".triage-list").count()) {
      await workQueue(page, plan);
      continue;
    }
    if (await page.locator(".queue").count()) {
      const alerts = page.locator(".alert-queue-open");
      const open = page.locator(".ticket-card:not(.done)");
      if ((plan.triage ?? "catch") !== "ignore" && (await alerts.count())) await alerts.click();
      else if (await open.count()) await open.first().click();
      // leaving alerts unworked asks once before it lets the day end
      else await page.locator(".desk-footer .btn.primary").click();
      continue;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`${plan.name}: did not finish`);
}

/** One step in the alert queue: make a call that is waiting, open the next alert worth it, or go back. */
async function workQueue(page: Page, plan: Plan): Promise<void> {
  const real = (id: string): boolean => QUEUE.find((a) => a.id === id)!.real;
  // an alert already open: make the call on it
  const opened = page.locator(".alert.al-opened").first();
  if (await opened.count()) {
    const id = (await opened.getAttribute("data-alert"))!;
    const escalate = plan.triage === "wrong" ? !real(id) : real(id);
    await opened.locator(escalate ? ".al-escalate" : ".al-close").click();
    return;
  }
  // otherwise open the real ones first, while there is time
  const ids = await page.locator(".alert:has(.al-open:not([disabled]))").evaluateAll((els) => els.map((e) => e.getAttribute("data-alert")!));
  const next = ids.find(real) ?? ids[0];
  if (next) await page.locator(`.alert[data-alert="${next}"] .al-open`).click();
  else await page.getByRole("button", { name: "Back to the desk" }).click();
}

/** Work one case in practice mode, from its brief back to the practice list. */
export async function practiseCase(page: Page, title: string): Promise<void> {
  await page.locator(".overlay-panel .btn.choice", { hasText: title }).click();
  for (let step = 0; step < 200; step++) {
    if (await page.locator(".overlay-panel h2", { hasText: "Practice a case" }).count()) return;
    const vn = page.locator(".vn[role=button]");
    if (await vn.count()) {
      await vn.click();
      continue;
    }
    if (await page.locator(".ws-title").count()) {
      await workCase(page, { name: "practice", track: "soc" });
      continue;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`practice of "${title}" did not finish`);
}

async function chooseInScene(page: Page, plan: Plan): Promise<void> {
  const prompt = await page.locator(".vn-choice-prompt").innerText();
  const scene = SCENES.find((s) => s.choice?.prompt === prompt);
  expect(scene, `scene with choice "${prompt}"`).toBeDefined();
  // options an earlier choice closed are shown but cannot be taken
  const offered = await page.locator(".vn-choice .btn.choice:not(.locked)").allInnerTexts();
  const options = scene!.choice!.options.filter((o) => offered.includes(o.text));
  const wanted = plan.scenes?.[scene!.id];
  const pick = wanted !== undefined ? scene!.choice!.options[wanted] : options[best(options)];
  expect(offered, `${scene!.id}: option "${pick.text}" is on offer`).toContain(pick.text);
  await withText(page, ".vn-choice .btn.choice:not(.locked)", pick.text).click();
}

async function answerScreening(page: Page, track: Dept): Promise<void> {
  const card = page.locator(".iv-card");
  // the hands-on task that ends the screening: do it on the tool, then submit
  if (await page.locator(".iv-practical").count()) {
    const next = page.getByRole("button", { name: "See the verdict" });
    if (await next.count()) {
      await next.click();
      return;
    }
    const s = await save(page);
    const p = practicalFor(track, s.seed, s.screeningFails);
    const holder = { id: "practical", chapter: 0, dept: track, severity: "low", client: "", title: "", brief: [], evidence: p.evidence, questions: [p.question], xp: 0, closingRight: [] } as Ticket;
    await answer(page, card.locator(".q-block"), p.question, { name: "x", track }, holder);
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(card.locator(".explain.good"), `${track} hands-on task is right`).toBeVisible();
    return;
  }
  const prompt = await card.locator(".q-prompt").innerText();
  const q = screeningFor(track)!.questions.find((x: { prompt: string }) => x.prompt === prompt);
  expect(q, `screening question "${prompt}"`).toBeDefined();
  await withText(card, ".opt", q!.options[q!.answer]).click();
  await expect(card.locator(".opt.correct")).toHaveText(q!.options[q!.answer]);
  await card.locator(".explain button").click();
}

async function workCase(page: Page, plan: Plan): Promise<void> {
  const close = page.getByRole("button", { name: "Close the case" });
  if (await close.count()) {
    await close.click();
    return;
  }
  const title = await page.locator(".ws-title").innerText();
  const base = TICKETS.find((x) => x.title === title);
  expect(base, `case "${title}"`).toBeDefined();
  // Fill in the same per-run data the game used, read from its own save, so the
  // bot's expected answers match what is on screen.
  const t = withRunData(base!, (await save(page)).seed);
  const blocks = page.locator(".q-panel .q-block");
  await expect(blocks).toHaveCount(t!.questions.length);
  if (plan.hard) await expect(page.locator(".hint-btn")).toHaveCount(0);
  for (let i = 0; i < t!.questions.length; i++) await answer(page, blocks.nth(i), t!.questions[i], plan, t!);
  await page.getByRole("button", { name: "Submit findings" }).click();
  await expect(close, `${t!.id} should close on the first submit`).toBeVisible();
  await expect(page.locator(".ws-feedback .good-note")).toBeVisible();
}

export async function answerOne(page: Page, block: Locator, q: Question, t: Ticket): Promise<void> {
  return answer(page, block, q, { name: "x", track: "soc" }, t);
}

// t is the case as this run sees it, so evidence lookups match what is on screen
async function answer(page: Page, block: Locator, q: Question, plan: Plan, t: Ticket): Promise<void> {
  const opt = (text: string): Locator => withText(block, ".opt", text);
  switch (q.type) {
    case "single":
      await opt(q.options[q.answer]).click();
      return;
    case "multi":
      for (const i of q.answer) await opt(q.options[i]).click();
      return;
    case "order":
      // move each item up into place, top to bottom
      for (let k = 0; k < q.items.length; k++) {
        let pos = (await block.locator(".ord-text").allInnerTexts()).indexOf(q.items[k]);
        while (pos > k) {
          await block.locator(".q-order li").nth(pos).locator(".ord-arrow").first().click();
          pos--;
        }
      }
      expect(await block.locator(".ord-text").allInnerTexts()).toEqual(q.items);
      return;
    case "typed":
      // do it the way a player would: run the command, read the output, type the answer
      if (q.solution) {
        const tool = page.locator(`[data-ev="${q.solution.evidence}"]`);
        const pivot = (await tool.locator(".pv-input").count()) > 0;
        const siem = (await tool.locator(".siem-input").count()) > 0;
        const box = tool.locator(pivot ? ".pv-input" : siem ? ".siem-input" : ".term-input");
        await box.fill(q.solution.command);
        await box.press("Enter");
        await expect(tool.locator(pivot ? ".pv-results" : siem ? ".siem-results" : ".term-out")).toContainText(q.answer[0]);
      }
      await block.locator(".typed-input").fill(q.answer[0]);
      return;
    case "rules": {
      const fw = page.locator(`[data-ev="${q.evidence}"]`);
      await fw.locator(".fw-rules").fill(q.solution);
      await fw.getByRole("button", { name: "Replay traffic" }).click();
      await expect(fw.locator(".fw-status")).toHaveClass(/good/);
      return;
    }
    case "request": {
      const rq = page.locator(`[data-ev="${q.evidence}"]`);
      const box = rq.locator(".req-input");
      const rev = t.evidence.find((e) => e.id === q.evidence);
      if (rev?.kind !== "request") throw new Error(`${q.evidence} is not a request editor`);
      if (rev.app.kind === "login") {
        // show there is no lockout with a few wrong guesses, then sign in
        for (let i = 0; i < LOCKOUT_PROOF; i++) {
          await rq.getByRole("button", { name: "Send" }).click();
          await expect(rq.locator(".req-response")).toContainText(`"failed_attempts": ${i + 1}`);
        }
        const guess = await box.inputValue();
        await box.fill(guess.replace(/pass=.*$/, `pass=${rev.app.password}`));
        await rq.getByRole("button", { name: "Send" }).click();
        await expect(rq.locator(".req-response")).toContainText("signed_in_as");
        return;
      }
      await rq.getByRole("button", { name: "Send" }).click();
      // change the booking id to one that is not ours and send again
      const text = await box.inputValue();
      await box.fill(text.replace("id=1041", "id=1042"));
      await rq.getByRole("button", { name: "Send" }).click();
      await expect(rq.locator(".req-response")).toContainText("belongs_to_this_session");
      return;
    }
    case "merge": {
      const tl = page.locator(`[data-ev="${q.evidence}"]`);
      const ev = t.evidence.find((e) => e.id === q.evidence);
      if (ev?.kind !== "merge") throw new Error(`${q.evidence} is not a timeline builder`);
      for (const src of ev.sources) await tl.locator(`select[data-source="${src.id}"]`).selectOption(String(src.offset));
      return;
    }
    case "console": {
      const adm = page.locator(`[data-ev="${q.evidence}"]`);
      for (const a of q.solution) {
        await adm.locator(`.adm-user[data-upn="${a.upn}"]`).click();
        if (a.type === "delete-rule") await adm.locator(`[data-act="delete-rule"][data-rule="${a.rule}"]`).click();
        else if (a.type === "mfa") {
          await adm.locator(`select[data-act="mfa"]`).selectOption(a.method);
          await adm.locator(`[data-act="save-mfa"]`).click();
        } else if (a.type === "block") {
          // the block button asks once to confirm, so click it twice
          const btn = adm.locator(`[data-act="block"]`);
          await btn.click();
          await btn.click();
        } else if (a.type === "delete-user") throw new Error("the bot never deletes accounts");
        else await adm.locator(`[data-act="${a.type}"]`).click();
      }
      return;
    }
    case "detect": {
      const box = block.locator(".det-rule");
      await box.fill(q.solution);
      await block.getByRole("button", { name: "Test rule" }).click();
      await expect(block.locator(".fw-status")).toHaveClass(/good/);
      return;
    }
    case "report":
      await block.locator(".report-input").fill(q.example);
      return;
    case "scope": {
      // check each target in the scope checker first, the way a tester would
      const sc = page.locator(`[data-ev="${q.evidence}"]`);
      const ev = t.evidence.find((e) => e.id === q.evidence);
      if (ev?.kind !== "scope") throw new Error(`${q.evidence} is not a scope checker`);
      for (const target of q.targets) {
        await sc.locator(".sc-input").fill(target.address);
        await sc.locator(".sc-input").press("Enter");
        const inScope = checkScope(ev, target.address).inScope;
        await expect(sc.locator(".sc-line").first()).toContainText(inScope ? "IN SCOPE" : "OUT OF SCOPE");
        // match the whole address, so 10.20.0.1 does not also match 10.20.0.100
        if (inScope) await block.locator(".opt").filter({ has: page.locator(".mono", { hasText: new RegExp(`^${target.address.replace(/\./g, "\\.")}$`) }) }).click();
      }
      return;
    }
    case "cvss": {
      const v = parseVector(q.vector);
      for (const m of METRICS) await block.locator(`.seg-btn[data-metric="${m}"][data-value="${v[m]}"]`).click();
      await expect(block.locator(".cvss-score")).toContainText(q.vector);
      return;
    }
    case "iocs":
      await block.locator(".ioc-input").fill(q.answer.map(defang).join("\n"));
      return;
    case "attack-map": {
      const inputs = block.locator(".map-input");
      for (let i = 0; i < q.items.length; i++) await inputs.nth(i).fill(q.items[i].answer[0]);
      return;
    }
    case "spot":
      await block.locator(".spot-btn").click();
      await page.locator(`[data-ev="${q.evidence}"] [data-pick="${q.answer[0]}"]`).click();
      return;
    case "decision": {
      const i = plan.decisions?.[q.id] ?? best(q.options);
      await withText(block, ".decision-opt", q.options[i].text).click();
      return;
    }
  }
}
