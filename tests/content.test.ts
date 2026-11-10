import { describe, it, expect } from "vitest";
import { SCREENINGS } from "../src/content/screenings";
import { TICKETS } from "../src/content/tickets";
import { SCENES } from "../src/content/scenes";
import { CHAPTERS } from "../src/content/chapters";
import { CODEX } from "../src/content/codex";
import { ENDINGS } from "../src/engine/endings";
import { pickTargets } from "../src/engine/pick";
import { runSolution } from "../src/engine/solution";
import { rulesPass } from "../src/engine/firewall";
import { initConsole, act, goalsMet } from "../src/engine/console";
import { mergeTimeline, offsetsRight } from "../src/engine/timeline";
import { answerMatches, normalizeAnswer } from "../src/engine/answer";
import { DEPTS } from "../src/engine/types";
import { checkScope } from "../src/engine/scope";
import { parseVector, baseScore } from "../src/engine/cvss";
import { refang } from "../src/engine/ioc";
import { testRule } from "../src/engine/detect";
import { checkReport } from "../src/engine/report";
import { ATTACK_CATALOGUE } from "../src/content/attack";
import { trackFlag } from "../src/engine/state";
import { VARYING_CASES, withRunData } from "../src/content/vary";
import { practicalFor } from "../src/content/practicals";
import { QUEUE, QUEUE_SIZE, queueFor, queueAftermath } from "../src/content/queue";
import { looksAllowed } from "../src/engine/triage";
import { freshSave } from "../src/engine/state";
import type { Ticket } from "../src/engine/types";

// Some cases are rebuilt from the run's seed. Every rule below that judges a
// case on its own is checked against the catalogue and against those cases as
// several different runs would see them.
const SEEDS = [1, 7, 42, 99, 1000, 123456, 20260310, 2 ** 31, 4294967295];
const VARIANTS = VARYING_CASES.flatMap((id) => SEEDS.map((seed) => withRunData(TICKETS.find((t) => t.id === id)!, seed)));
const EVERY = [...TICKETS, ...VARIANTS];

// The hands-on task that ends each screening, as many different sittings see it.
const PRACTICALS = DEPTS.flatMap((dept) => SEEDS.flatMap((seed) => [0, 1, 2].map((fails) => ({ dept, seed, fails, p: practicalFor(dept, seed, fails) }))));
// wrapped as cases, so the text rules below read them like any other
const PRACTICAL_CASES: Ticket[] = PRACTICALS.map(({ dept, p }) => ({ id: `practical_${dept}`, chapter: 0, dept, severity: "low", client: "", title: p.intro, brief: [p.howTo], evidence: p.evidence, questions: [p.question], xp: 0, closingRight: [] }));

// Gather every string of player-facing text so we can assert house rules on it.
function allText(): string[] {
  const out: string[] = [];
  const push = (s?: string): void => {
    if (typeof s === "string") out.push(s);
  };

  for (const iv of SCREENINGS) {
    iv.intro.forEach(push);
    iv.hiredText.forEach(push);
    iv.rejectedText.forEach(push);
    for (const q of iv.questions) {
      push(q.prompt);
      q.options.forEach(push);
      push(q.explainRight);
      push(q.explainWrong);
    }
  }
  for (const t of [...EVERY, ...PRACTICAL_CASES]) {
    push(t.title);
    (t.attack ?? []).forEach((a) => push(a.name));
    (t.takeaways ?? []).forEach((x) => {
      push(x.label);
      push(x.text);
    });
    push(t.brief.join(" "));
    t.closingRight.forEach(push);
    for (const ev of t.evidence) {
      push(ev.label);
      if (ev.kind === "terminal") {
        Object.entries(ev.files).forEach(([name, text]) => {
          push(name);
          push(text);
        });
      } else if (ev.kind === "siem") {
        ev.events.forEach((e) => Object.values(e).forEach(push));
      } else if (ev.kind === "raw") {
        push(ev.caption);
        push(ev.text);
      } else if (ev.kind === "scope") {
        push(ev.note);
        ev.inScope.forEach(push);
        ev.outOfScope.forEach(push);
      } else if (ev.kind === "attackdb") {
        ev.techniques.forEach((x) => [x.id, x.name, x.tactic, x.summary].forEach(push));
      } else if (ev.kind === "pivot") {
        push(ev.caption);
        push(ev.start);
        ev.db.records.forEach((r) => {
          push(r.domain);
          push(r.ip);
          push(r.note);
        });
      } else if (ev.kind === "request") {
        push(ev.app.host);
        push(ev.request);
        if (ev.app.kind === "login") [ev.app.user, ev.app.password, ev.app.role].forEach(push);
        else Object.values(ev.app.records).forEach((rec) => Object.values(rec).forEach(push));
      } else if (ev.kind === "merge") {
        push(ev.caption);
        ev.sources.forEach((src) => {
          push(src.name);
          push(src.note);
          src.events.forEach((e) => push(e.text));
        });
      } else if (ev.kind === "console") {
        push(ev.tenant);
        ev.users.forEach((u) => {
          [u.upn, u.name, u.role].forEach(push);
          u.sessions.forEach((x) => [x.device, x.ip, x.place].forEach(push));
          u.rules.forEach((r) => [r.name, r.summary].forEach(push));
        });
      } else if (ev.kind === "firewall") {
        push(ev.rules);
        Object.values(ev.zones).forEach((z) => z.forEach(push));
        ev.flows.forEach((f) => {
          push(f.src);
          push(f.dst);
          push(f.what);
        });
      } else if (ev.kind === "email") {
        push(ev.from);
        push(ev.to);
        push(ev.subject);
        ev.body.forEach(push);
        if (ev.headers) Object.values(ev.headers).forEach(push);
      } else if (ev.kind === "log") {
        ev.rows.forEach((r) => r.forEach(push));
      } else if (ev.kind === "chat") {
        ev.lines.forEach((l) => push(l.text));
      } else if (ev.kind === "flow") {
        ev.rows.forEach((r) => {
          push(r.src);
          push(r.dst);
          push(r.note);
        });
      } else if (ev.kind === "note") {
        push(ev.title);
        ev.lines.forEach(push);
      } else if (ev.kind === "timeline") {
        ev.events.forEach((e) => push(e.text));
      } else if (ev.kind === "tree") {
        const walk = (n: { name: string; detail?: string; children?: unknown[] }): void => {
          push(n.name);
          push(n.detail);
          (n.children as typeof n[] | undefined)?.forEach(walk);
        };
        walk(ev.root);
      }
    }
    for (const q of t.questions) {
      push(q.prompt);
      if (q.type !== "decision") push(q.hint);
      if (q.type === "single" || q.type === "multi") {
        q.options.forEach(push);
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "order") {
        q.items.forEach(push);
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "spot") {
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "typed") {
        q.answer.forEach(push);
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "merge") {
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "scope") {
        q.targets.forEach((x) => [x.address, x.what].forEach(push));
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "cvss") {
        Object.values(q.why).forEach(push);
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "iocs") {
        q.answer.forEach(push);
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "attack-map") {
        q.items.forEach((x) => push(x.behavior));
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "detect") {
        push(q.start);
        push(q.solution);
        q.tests.forEach((x) => push(x.what));
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "report") {
        q.facts.forEach((x) => push(x.label));
        push(q.example);
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "request") {
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "console") {
        q.goals.forEach((g) => push(g.label));
        push(q.explainRight);
        push(q.explainWrong);
      } else if (q.type === "rules") {
        push(q.solution);
        push(q.explainRight);
        push(q.explainWrong);
      } else {
        for (const o of q.options) {
          push(o.text);
          push(o.result);
        }
      }
    }
  }
  for (const a of QUEUE) {
    [a.title, a.source, a.why, a.caught, a.missed].forEach(push);
    a.details.forEach(push);
  }
  for (const s of SCENES) {
    s.lines.forEach((l) => push(l.text));
    if (s.choice) {
      push(s.choice.prompt);
      for (const o of s.choice.options) {
        push(o.text);
        o.reply?.forEach((l) => push(l.text));
        o.locks?.forEach((l) => push(l.note));
      }
    }
  }
  for (const c of CODEX) {
    push(c.term);
    c.body.forEach(push);
  }
  for (const e of Object.values(ENDINGS)) {
    push(e.title);
    push(e.epigraph);
    e.lines.forEach(push);
    push(e.rankTitle);
    push(e.hint);
  }
  return out;
}

describe("writing house rules", () => {
  const text = allText();

  it("contains no em dashes or en dashes", () => {
    const offenders = text.filter((s) => s.includes("—") || s.includes("–"));
    expect(offenders).toEqual([]);
  });

  it("uses only reserved documentation IP ranges", () => {
    // Any dotted quad that appears must be in a documentation or private range.
    const quad = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
    const allowed = (ip: string): boolean => {
      const [a, b] = ip.split(".").map(Number);
      if (a === 192 && b === 0) return true; // 192.0.2.0/24 documentation (and 192.0.x)
      if (a === 198 && b === 51) return true; // 198.51.100.0/24
      if (a === 203 && b === 0) return true; // 203.0.113.0/24
      if (a === 10) return true; // private
      if (a === 192 && b === 168) return true; // private
      if (a === 172 && b >= 16 && b <= 31) return true; // private
      return false;
    };
    const bad: string[] = [];
    for (const s of text) {
      const matches = s.match(quad);
      if (!matches) continue;
      for (const m of matches) if (!allowed(m)) bad.push(m);
    }
    expect(bad).toEqual([]);
  });

  it("never references a real public TLD (domains stay in .example/.test)", () => {
    // The real risk is a domain that points at a live system. Flag any token
    // ending in a genuine public TLD. Fictional usernames like "w.abernathy"
    // and process names like "services.host" are not domains and are fine.
    const realTld =
      /\b[a-z0-9-]+\.(com|net|org|io|gov|edu|co|us|uk|dev|app|info|biz|ai|xyz|cloud|online|site|tech|me|ru|cn|de|fr)\b/i;
    const bad = text.filter((s) => realTld.test(s));
    expect(bad).toEqual([]);
  });

  it("defangs any http links", () => {
    const offenders = text.filter((s) => /https?:\/\//i.test(s));
    expect(offenders).toEqual([]);
  });
});

describe("content integrity", () => {
  it("every chapter references scenes and tickets that exist", () => {
    const sceneIds = new Set(SCENES.map((s) => s.id));
    const ticketIds = new Set(TICKETS.map((t) => t.id));
    for (const ch of CHAPTERS) {
      expect(sceneIds.has(ch.intro), `intro ${ch.intro}`).toBe(true);
      for (const m of ch.main) expect(ticketIds.has(m), `main ticket ${m}`).toBe(true);
      for (const s of ch.side) expect(ticketIds.has(s), `side ticket ${s}`).toBe(true);
      for (const o of ch.outro) expect(sceneIds.has(o), `outro ${o}`).toBe(true);
    }
  });

  it("single and multi questions have valid answer indices", () => {
    for (const t of EVERY) {
      for (const q of t.questions) {
        if (q.type === "single") {
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(q.answer).toBeLessThan(q.options.length);
        } else if (q.type === "multi") {
          expect(q.answer.length).toBeGreaterThan(0);
          for (const a of q.answer) expect(a).toBeLessThan(q.options.length);
        }
      }
    }
    for (const iv of SCREENINGS) {
      for (const q of iv.questions) {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
      }
    }
  });

  it("every ticket requirement flag is produced somewhere", () => {
    const produced = new Set<string>();
    DEPTS.forEach((d) => produced.add(trackFlag(d))); // set when you are hired
    for (const t of TICKETS) (t.setFlags ?? []).forEach((f) => produced.add(f));
    for (const s of SCENES) {
      (s.setFlags ?? []).forEach((f) => produced.add(f));
      s.choice?.options.forEach((o) => (o.setFlags ?? []).forEach((f) => produced.add(f)));
    }
    for (const t of TICKETS) {
      t.questions.forEach((q) => {
        if (q.type === "decision") q.options.forEach((o) => (o.setFlags ?? []).forEach((f) => produced.add(f)));
      });
    }
    for (const t of TICKETS) {
      for (const req of t.requires ?? []) {
        expect(produced.has(req), `requirement ${req} for ${t.id} is never set`).toBe(true);
      }
    }
  });

  it("each screening is winnable and losable", () => {
    for (const iv of SCREENINGS) {
      expect(iv.passLine).toBeGreaterThan(0);
      expect(iv.passLine).toBeLessThanOrEqual(iv.asks);
    }
  });

  it("each screening draws from a pool big enough that a retry is a different screening", () => {
    for (const iv of SCREENINGS) {
      expect(iv.asks, iv.dept).toBeLessThanOrEqual(iv.questions.length);
      expect(iv.questions.length, iv.dept).toBeGreaterThanOrEqual(iv.asks + 3);
    }
  });
});

// Quiz-writing house rule: the right answer must not stand out by length.
// When the correct option is always the longest, players learn to pick the
// longest option instead of reading the evidence.
describe("answer options do not give the answer away", () => {
  const singles = [
    ...TICKETS.flatMap((t) => t.questions),
    ...SCREENINGS.flatMap((iv) => iv.questions),
  ].filter((q) => q.type === "single");

  it("the correct option is never much longer than the longest wrong one", () => {
    for (const q of singles) {
      if (q.type !== "single") continue;
      const right = q.options[q.answer].length;
      const longestWrong = Math.max(...q.options.filter((_, i) => i !== q.answer).map((o) => o.length));
      expect(right, `${q.id}: correct option is ${right} characters, longest wrong one is ${longestWrong}`).toBeLessThanOrEqual(longestWrong * 1.15);
    }
  });

  it("the correct option is the longest in at most a third of the questions", () => {
    const longest = singles.filter((q) => {
      if (q.type !== "single") return false;
      const lens = q.options.map((o) => o.length);
      return lens[q.answer] === Math.max(...lens) && lens.filter((l) => l === lens[q.answer]).length === 1;
    });
    expect(longest.length, longest.map((q) => q.id).join(", ")).toBeLessThanOrEqual(Math.floor(singles.length / 3));
  });
});

describe("spot questions, hints and ATT&CK tags", () => {
  const graded = EVERY.flatMap((t) => t.questions.filter((q) => q.type !== "decision").map((q) => ({ t, q })));

  it("every spot question points at evidence in its own ticket and at parts that exist", () => {
    for (const t of EVERY) {
      for (const q of t.questions) {
        if (q.type !== "spot") continue;
        const ev = t.evidence.find((e) => e.id === q.evidence);
        expect(ev, `${q.id}: evidence ${q.evidence}`).toBeDefined();
        const keys = new Set(pickTargets(ev!).map((p) => p.key));
        expect(q.answer.length).toBeGreaterThan(0);
        for (const a of q.answer) expect(keys.has(a), `${q.id}: ${a} is not a part of ${q.evidence}`).toBe(true);
        // there has to be something wrong to click as well
        expect(keys.size).toBeGreaterThan(q.answer.length);
      }
    }
  });

  it("every graded case question has a hint", () => {
    const missing = graded.filter(({ q }) => !q.hint).map(({ q }) => q.id);
    expect(missing).toEqual([]);
  });

  it("no hint quotes the right answer", () => {
    for (const { q } of graded) {
      if (!q.hint) continue;
      const hint = q.hint.toLowerCase();
      const right =
        q.type === "single" ? [q.options[q.answer]] : q.type === "multi" ? q.answer.map((i) => q.options[i]) : q.type === "typed" ? [q.answer[0]] : [];
      for (const r of right) expect(hint.includes(r.toLowerCase()), `${q.id}: hint gives away "${r}"`).toBe(false);
    }
  });

  it("question ids are unique", () => {
    const ids = [...TICKETS.flatMap((t) => t.questions.map((q) => q.id)), ...SCREENINGS.flatMap((iv) => iv.questions.map((q) => q.id))];
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("ATT&CK tags are well formed and not repeated within a case", () => {
    for (const t of EVERY) {
      const ids = (t.attack ?? []).map((a) => a.id);
      for (const a of t.attack ?? []) {
        expect(a.id, t.id).toMatch(/^T\d{4}(\.\d{3})?$/);
        expect(a.name.length).toBeGreaterThan(2);
      }
      expect(new Set(ids).size, t.id).toBe(ids.length);
    }
  });

  it("the ATT&CK field note exists, since closing a tagged case unlocks it", () => {
    expect(CODEX.some((c) => c.id === "attack")).toBe(true);
  });
});

describe("track and side cases", () => {
  it("each track has a chapter-two case of its own, briefed by that team", () => {
    for (const d of DEPTS) {
      const own = TICKETS.filter((t) => t.requires?.includes(trackFlag(d)));
      const ch2 = own.filter((t) => t.chapter === 2);
      expect(ch2.length, d).toBe(1);
      expect(ch2[0].dept, d).toBe(d);
      for (const t of own) expect(t.dept, `${t.id} is gated to ${d}`).toBe(d);
    }
  });

  it("track cases are main cases, side cases are listed as sides, in the right chapter", () => {
    for (const ch of CHAPTERS) {
      for (const id of ch.main) {
        const t = TICKETS.find((x) => x.id === id)!;
        expect(t.side, id).toBeFalsy();
        expect(t.chapter, id).toBe(ch.chapter);
      }
      for (const id of ch.side) {
        const t = TICKETS.find((x) => x.id === id)!;
        expect(t.side, id).toBe(true);
        expect(t.chapter, id).toBe(ch.chapter);
      }
    }
  });

  it("every case is reachable from some chapter", () => {
    const listed = new Set(CHAPTERS.flatMap((c) => [...c.main, ...c.side]));
    expect(TICKETS.filter((t) => !listed.has(t.id)).map((t) => t.id)).toEqual([]);
  });

  it("every Field Note is taught somewhere", () => {
    const taught = new Set(TICKETS.flatMap((t) => t.questions.flatMap((q) => ("teaches" in q && q.teaches ? [q.teaches] : []))));
    taught.add("attack"); // unlocked by closing any case with ATT&CK tags
    expect(CODEX.filter((c) => !taught.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it("every track's chapter-two case offers the same integrity swing", () => {
    for (const d of DEPTS) {
      const t = TICKETS.find((x) => x.requires?.includes(trackFlag(d)) && x.chapter === 2)!;
      const swings = t.questions.flatMap((q) => (q.type === "decision" ? q.options.map((o) => o.integrity ?? 0) : []));
      expect(Math.max(...swings), d).toBe(1);
      expect(Math.min(...swings), d).toBe(-1);
    }
  });
});

describe("terminal cases", () => {
  const typed = EVERY.flatMap((t) => t.questions.flatMap((q) => (q.type === "typed" ? [{ t, q }] : [])));

  it("every typed question's example command really finds the answer", () => {
    for (const { t, q } of typed) {
      if (!q.solution) continue;
      const ev = t.evidence.find((e) => e.id === q.solution!.evidence);
      expect(ev?.kind === "terminal" || ev?.kind === "siem" || ev?.kind === "pivot", `${q.id}: ${q.solution.evidence} is a runnable tool`).toBe(true);
      if (!ev) continue;
      const r = runSolution(ev, q.solution.command);
      expect(r.error, `${q.id}: ${r.out}`).toBeFalsy();
      expect(normalizeAnswer(r.out), `${q.id}: "${q.solution.command}" printed:\n${r.out}`).toContain(normalizeAnswer(q.answer[0]));
    }
  });

  it("typed questions accept their own answers and refuse an empty one", () => {
    for (const { q } of typed) {
      for (const a of q.answer) expect(answerMatches(a, q.answer), q.id).toBe(true);
      expect(answerMatches("  ", q.answer)).toBe(false);
    }
  });

  it("answers are matched loosely but not wrongly", () => {
    expect(answerMatches(" Sync-Telemetry[.]example. ", ["sync-telemetry.example"])).toBe(true);
    expect(answerMatches("telemetry.example", ["sync-telemetry.example"])).toBe(false);
  });
});

describe("firewall cases", () => {
  const rulesQs = EVERY.flatMap((t) => t.questions.flatMap((q) => (q.type === "rules" ? [{ t, q }] : [])));

  it("the given solution passes every flow, and the starting rules do not", () => {
    for (const { t, q } of rulesQs) {
      const ev = t.evidence.find((e) => e.id === q.evidence);
      expect(ev?.kind, q.id).toBe("firewall");
      if (ev?.kind !== "firewall") continue;
      expect(rulesPass(q.solution, ev.flows, ev.zones), `${q.id}: solution`).toBe(true);
      expect(rulesPass(ev.rules, ev.flows, ev.zones), `${q.id}: starting rules already pass`).toBe(false);
    }
  });
});

describe("admin console cases", () => {
  const consoleQs = EVERY.flatMap((t) => t.questions.flatMap((q) => (q.type === "console" ? [{ t, q }] : [])));

  it("the given solution meets every goal, and doing nothing meets none of the work", () => {
    for (const { t, q } of consoleQs) {
      const ev = t.evidence.find((e) => e.id === q.evidence);
      expect(ev?.kind, q.id).toBe("console");
      if (ev?.kind !== "console") continue;
      const s = initConsole(ev.users);
      for (const a of q.solution) act(s, a, ev.intruder);
      expect(goalsMet(s, q.goals, ev.users), `${q.id}: solution`).toBe(true);
      expect(goalsMet(initConsole(ev.users), q.goals, ev.users), `${q.id}: untouched console already passes`).toBe(false);
      for (const g of q.goals) expect(g.label.length, q.id).toBeGreaterThan(10);
    }
  });
});

describe("timeline builder cases", () => {
  const mergeQs = EVERY.flatMap((t) => t.questions.flatMap((q) => (q.type === "merge" ? [{ t, q }] : [])));

  it("needs at least one clock changed, and the true order puts cause before effect", () => {
    for (const { t, q } of mergeQs) {
      const ev = t.evidence.find((e) => e.id === q.evidence);
      expect(ev?.kind, q.id).toBe("merge");
      if (ev?.kind !== "merge") continue;
      const untouched = Object.fromEntries(ev.sources.map((s) => [s.id, 0]));
      expect(offsetsRight(ev.sources, untouched), `${q.id}: already right with no changes`).toBe(false);
      const right = Object.fromEntries(ev.sources.map((s) => [s.id, s.offset]));
      const order = mergeTimeline(ev.sources, right).map((e) => e.text);
      const wrong = mergeTimeline(ev.sources, untouched).map((e) => e.text);
      expect(order, `${q.id}: the wrong clocks should tell a different story`).not.toEqual(wrong);
    }
  });
});

describe("scope, CVSS, block list and ATT&CK questions", () => {
  const qs = EVERY.flatMap((t) => t.questions.map((q) => ({ t, q })));

  it("scope questions have targets on both sides of the line", () => {
    for (const { t, q } of qs) {
      if (q.type !== "scope") continue;
      const ev = t.evidence.find((e) => e.id === q.evidence);
      expect(ev?.kind, q.id).toBe("scope");
      if (ev?.kind !== "scope") continue;
      const v = q.targets.map((x) => checkScope(ev, x.address).inScope);
      expect(v.some(Boolean), `${q.id}: something in scope`).toBe(true);
      expect(v.some((x) => !x), `${q.id}: something out of scope`).toBe(true);
    }
  });

  it("CVSS answers are valid vectors, with a reason for every metric", () => {
    for (const { q } of qs) {
      if (q.type !== "cvss") continue;
      const v = parseVector(q.vector);
      expect(baseScore(v), q.id).toBeGreaterThan(0);
      expect(Object.keys(q.why).sort(), q.id).toEqual(Object.keys(v).sort());
    }
  });

  it("block lists hold distinct indicators, none of them defanged in the answer key", () => {
    for (const { q } of qs) {
      if (q.type !== "iocs") continue;
      expect(new Set(q.answer.map(refang)).size, q.id).toBe(q.answer.length);
      for (const a of q.answer) expect(refang(a), q.id).toBe(a.toLowerCase());
    }
  });

  it("ATT&CK answers and case tags are real entries in the lookup", () => {
    const byId = new Map(ATTACK_CATALOGUE.map((x) => [x.id, x]));
    for (const { q } of qs) {
      if (q.type !== "attack-map") continue;
      for (const it of q.items) expect(byId.has(it.answer[0]), `${q.id}: ${it.answer[0]}`).toBe(true);
    }
    for (const t of EVERY) for (const a of t.attack ?? []) expect(byId.get(a.id)?.name, `${t.id}: ${a.id}`).toBe(a.name);
    expect(new Set(ATTACK_CATALOGUE.map((x) => x.id)).size).toBe(ATTACK_CATALOGUE.length);
  });
});

describe("detection rule and report questions", () => {
  const qs = EVERY.flatMap((t) => t.questions);

  it("every detection rule's solution passes the replay and its start does not", () => {
    for (const q of qs) {
      if (q.type !== "detect") continue;
      expect(q.tests.some((t) => t.want === "alert"), `${q.id}: has an attack`).toBe(true);
      expect(q.tests.some((t) => t.want === "quiet"), `${q.id}: has a normal event`).toBe(true);
      expect(testRule(q.solution, q.tests).ok, `${q.id}: solution`).toBe(true);
      expect(testRule(q.start, q.tests).ok, `${q.id}: start already passes`).toBe(false);
    }
  });

  it("every report's example covers every fact and clears the word count", () => {
    for (const q of qs) {
      if (q.type !== "report") continue;
      const g = checkReport(q.example, q.facts, q.minWords);
      expect(g.ok, `${q.id}: example misses ${q.facts.filter((_, i) => !g.covered[i]).map((f) => f.label).join("; ") || "word count"}`).toBe(true);
      expect(checkReport("too short", q.facts, q.minWords).ok, `${q.id}: a stub passes`).toBe(false);
    }
  });

  it("optional secret questions never block a case and set a secret flag", () => {
    for (const t of EVERY) {
      for (const q of t.questions) {
        if (!("secret" in q) || !q.secret) continue;
        expect(q.type, `${q.id}`).toBe("typed");
        expect(q.secret.startsWith("secret_"), q.id).toBe(true);
      }
    }
  });

  it("a live case has a sensible clock", () => {
    for (const t of EVERY) {
      if (!t.live) continue;
      expect(t.live.seconds, t.id).toBeGreaterThanOrEqual(60);
      expect(t.live.seconds, t.id).toBeLessThanOrEqual(600);
    }
  });
});

describe("screening hands-on tasks", () => {
  it("every team has one, and the task can be done and can be failed", () => {
    for (const { dept, seed, fails, p } of PRACTICALS) {
      const tag = `${dept}/${seed}/${fails}`;
      const q = p.question;
      expect(p.intro.length, tag).toBeGreaterThan(20);
      expect(p.howTo.length, tag).toBeGreaterThan(20);
      expect(q.hint, `${tag}: a screening gives no hints`).toBeUndefined();
      if (q.type === "typed") {
        const ev = p.evidence.find((e) => e.id === q.solution!.evidence)!;
        const r = runSolution(ev, q.solution!.command);
        expect(r.error, `${tag}: ${r.out}`).toBeFalsy();
        expect(normalizeAnswer(r.out), tag).toContain(normalizeAnswer(q.answer[0]));
        expect(answerMatches(q.answer[0], q.answer), tag).toBe(true);
      } else if (q.type === "spot") {
        const keys = new Set(pickTargets(p.evidence.find((e) => e.id === q.evidence)!).map((k) => k.key));
        for (const a of q.answer) expect(keys.has(a), `${tag}: ${a}`).toBe(true);
        expect(keys.size, tag).toBeGreaterThan(q.answer.length);
      } else if (q.type === "rules") {
        const ev = p.evidence.find((e) => e.id === q.evidence)!;
        if (ev.kind !== "firewall") throw new Error(tag);
        expect(rulesPass(q.solution, ev.flows, ev.zones), `${tag}: solution`).toBe(true);
        expect(rulesPass(ev.rules, ev.flows, ev.zones), `${tag}: start already passes`).toBe(false);
      } else if (q.type === "scope") {
        const ev = p.evidence.find((e) => e.id === q.evidence)!;
        if (ev.kind !== "scope") throw new Error(tag);
        const v = q.targets.map((x) => checkScope(ev, x.address).inScope);
        expect(v.some(Boolean), tag).toBe(true);
        expect(v.some((x) => !x), tag).toBe(true);
      } else {
        throw new Error(`${tag}: a ${q.type} task has no check here`);
      }
    }
  });

  it("a retry gets a different task, and the same sitting always gets the same one", () => {
    for (const dept of DEPTS) {
      expect(JSON.stringify(practicalFor(dept, 42, 0))).toBe(JSON.stringify(practicalFor(dept, 42, 0)));
      const seen = new Set(Array.from({ length: 12 }, (_, fails) => JSON.stringify(practicalFor(dept, 42, fails).question)));
      expect(seen.size, dept).toBeGreaterThan(1);
    }
  });

  it("a screening still asks the same number of things, one of them hands-on", () => {
    for (const iv of SCREENINGS) expect(iv.asks - 1, iv.dept).toBeGreaterThanOrEqual(iv.passLine);
  });
});

describe("the alert queue", () => {
  const chapters = [2, 3, 4, 5] as const;

  it("every chapter from two on brings more alerts than there is time for", () => {
    expect(queueFor(1, 42)).toEqual([]);
    for (const ch of chapters) {
      const q = queueFor(ch, 42);
      expect(q.length, `chapter ${ch}`).toBe(QUEUE_SIZE);
      expect(q.length).toBeGreaterThan(looksAllowed(freshSave()));
      // every real one can be caught, with a look to spare, and there is noise to wade through
      const real = q.filter((a) => a.real).length;
      expect(real, `chapter ${ch}`).toBeGreaterThanOrEqual(1);
      expect(real).toBeLessThanOrEqual(looksAllowed({ ...freshSave(), hard: true }));
      expect(q.length - real).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(QUEUE.map((a) => a.id)).size).toBe(QUEUE.length);
  });

  it("the tool's severity does not give the answer away", () => {
    // if every real alert were the loudest, sorting by severity would be the whole job
    const loud = (s: string): boolean => s === "high" || s === "critical";
    expect(QUEUE.filter((a) => a.real && loud(a.severity)).length).toBeLessThan(QUEUE.filter((a) => a.real).length / 2);
    expect(QUEUE.filter((a) => !a.real && loud(a.severity)).length).toBeGreaterThan(0);
    for (const ch of chapters) {
      const q = QUEUE.filter((a) => a.chapter === ch);
      expect(q.some((a) => !a.real && loud(a.severity)), `chapter ${ch} has loud noise`).toBe(true);
    }
  });

  it("each alert has enough to make the call on, and a reason", () => {
    for (const a of QUEUE) {
      expect(a.details.length, a.id).toBeGreaterThanOrEqual(2);
      expect(a.why.length, a.id).toBeGreaterThan(40);
      expect(a.title.length, a.id).toBeLessThan(60);
    }
  });

  it("every real alert comes back in the story, caught or missed, and benign ones never do", () => {
    for (const a of QUEUE) {
      if (a.real) {
        expect(a.caught?.length ?? 0, a.id).toBeGreaterThan(30);
        expect(a.missed?.length ?? 0, a.id).toBeGreaterThan(30);
      } else {
        expect(a.caught, a.id).toBeUndefined();
        expect(a.missed, a.id).toBeUndefined();
      }
    }
    // chapters two to four speak in the next chapter's opening scene; five is the epilogue
    for (const [ch, scene] of [[2, "s3_intro"], [3, "s4_intro"], [4, "s5_intro"]] as const) {
      const lines = SCENES.find((s) => s.id === scene)!.lines;
      for (const l of queueAftermath(ch)) {
        expect(lines).toContainEqual(l);
        expect(l.who, `${scene} is spoken`).not.toBe("narration");
        expect(l.showIf?.length).toBe(1);
      }
    }
    for (const l of queueAftermath(5)) expect(l.who).toBe("narration");
  });

  it("the order follows the run, and is the same every time for that run", () => {
    expect(queueFor(3, 7).map((a) => a.id)).toEqual(queueFor(3, 7).map((a) => a.id));
    const orders = new Set(Array.from({ length: 20 }, (_, seed) => queueFor(3, seed).map((a) => a.id).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});
