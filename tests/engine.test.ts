import { describe, it, expect, beforeEach } from "vitest";
import {
  freshSave,
  rankIndex,
  rankTitle,
  rankProgress,
  setFlag,
  hasFlag,
  hasAll,
  hasNone,
  visibleLines,
  markDone,
  isDone,
  conduct,
  accuracy,
  RANK_THRESHOLDS,
  RANK_TITLES,
  load,
  save,
  wipe,
  xpForClose,
  HINT_COST,
  trackFlag,
} from "../src/engine/state";
import { DEPTS, type Dept } from "../src/engine/types";
import { TICKETS } from "../src/content/tickets";
import { CHAPTERS } from "../src/content/chapters";
import { resolveEnding, ENDINGS, F, FINALE_SUCCESS, FINALE_FAILED, LIGHTHOUSE_MIN_INTEGRITY } from "../src/engine/endings";
import { liveSeconds, CROSSED_LINE } from "../src/engine/live";
import { SCENES } from "../src/content/scenes";

describe("conditional dialogue lines", () => {
  it("drops showIf lines until the flag is set, keeps ungated ones", () => {
    const lines = [
      { who: "you", text: "always" },
      { who: "walter", text: "only after the promise", showIf: [F.buriedTruth] },
    ];
    expect(visibleLines(freshSave(), lines).map((l) => l.text)).toEqual(["always"]);
    const s = freshSave();
    setFlag(s, F.buriedTruth);
    expect(visibleLines(s, lines).map((l) => l.text)).toEqual(["always", "only after the promise"]);
  });

  it("Walter reacts to reporting out only when you took his promotion", () => {
    const evidence = SCENES.find((sc) => sc.id === "s5_evidence");
    const reportOut = evidence?.choice?.options.find((o) => o.setFlags?.includes(F.reportedOut));
    const gated = reportOut?.reply?.filter((l) => l.showIf?.includes(F.buriedTruth)) ?? [];
    expect(gated).toHaveLength(1);
  });

  it("skips the evidence choice after a failed containment", () => {
    const evidence = SCENES.find((sc) => sc.id === "s5_evidence");
    expect(evidence?.hideIf).toContain(FINALE_FAILED);
  });
});

describe("ranks", () => {
  it("starts as Applicant before hire", () => {
    const s = freshSave();
    expect(rankIndex(s)).toBe(0);
    expect(rankTitle(s)).toBe("Applicant");
  });

  it("climbs the ladder with xp once hired", () => {
    const s = freshSave();
    s.hired = true;
    s.xp = 0;
    expect(rankTitle(s)).toBe(RANK_TITLES[1]);
    s.xp = RANK_THRESHOLDS[2];
    expect(rankIndex(s)).toBe(2);
    s.xp = RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1] + 500;
    expect(rankIndex(s)).toBe(RANK_TITLES.length - 1);
    expect(rankProgress(s).max).toBe(true);
  });

  it("reports progress toward the next rank", () => {
    const s = freshSave();
    s.hired = true;
    s.xp = RANK_THRESHOLDS[2];
    const p = rankProgress(s);
    expect(p.have).toBe(0);
    expect(p.need).toBe(RANK_THRESHOLDS[3] - RANK_THRESHOLDS[2]);
  });
});

describe("flags and progress", () => {
  it("sets, reads and gates on flags", () => {
    const s = freshSave();
    setFlag(s, "a");
    setFlag(s, "a"); // idempotent
    expect(s.flags.filter((f) => f === "a").length).toBe(1);
    expect(hasFlag(s, "a")).toBe(true);
    expect(hasAll(s, ["a"])).toBe(true);
    expect(hasAll(s, ["a", "b"])).toBe(false);
    expect(hasNone(s, ["b"])).toBe(true);
    expect(hasNone(s, ["a"])).toBe(false);
  });

  it("tracks done ids", () => {
    const s = freshSave();
    markDone(s, "t1");
    markDone(s, "t1");
    expect(s.done).toEqual(["t1"]);
    expect(isDone(s, "t1")).toBe(true);
  });
});

describe("save/load", () => {
  beforeEach(() => wipe());

  it("round-trips through localStorage", () => {
    const s = freshSave();
    s.playerName = "Riley";
    s.hired = true;
    s.xp = 200;
    setFlag(s, "knows_truth");
    save(s);
    const back = load();
    expect(back.playerName).toBe("Riley");
    expect(back.xp).toBe(200);
    expect(hasFlag(back, "knows_truth")).toBe(true);
  });

  it("returns a fresh save when nothing is stored", () => {
    const s = load();
    expect(s.hired).toBe(false);
    expect(s.playerName).toBe("");
  });
});

describe("endings", () => {
  function base(): ReturnType<typeof freshSave> {
    const s = freshSave();
    s.hired = true;
    s.chapter = 6;
    return s;
  }

  it("a failed finale always ends in Dead Water", () => {
    const s = base();
    setFlag(s, FINALE_SUCCESS); // even with success flags present
    setFlag(s, F.reportedOut);
    setFlag(s, F.chainIntact);
    setFlag(s, FINALE_FAILED); // failure dominates
    expect(resolveEnding(s).id).toBe(ENDINGS.deadwater.id);
  });

  it("reaches The Lighthouse with a clean chain, external report, and enough integrity", () => {
    const s = base();
    setFlag(s, FINALE_SUCCESS);
    setFlag(s, F.reportedOut);
    setFlag(s, F.chainIntact);
    s.integrity = LIGHTHOUSE_MIN_INTEGRITY;
    expect(resolveEnding(s).id).toBe(ENDINGS.lighthouse.id);
  });

  it("gives Cracked Lens, not The Lighthouse, when integrity is too low for a clean report", () => {
    const s = base();
    setFlag(s, FINALE_SUCCESS);
    setFlag(s, F.reportedOut);
    setFlag(s, F.chainIntact);
    s.integrity = LIGHTHOUSE_MIN_INTEGRITY - 1;
    expect(resolveEnding(s).id).toBe(ENDINGS.crackedlens.id);
  });

  it("reaches Low Tide whenever you hand Nadia the evidence", () => {
    for (const trusted of [true, false]) {
      const s = base();
      setFlag(s, FINALE_SUCCESS);
      setFlag(s, F.gaveNadia);
      if (trusted) setFlag(s, F.trustNadia);
      expect(resolveEnding(s).id).toBe(ENDINGS.lowtide.id);
    }
  });

  it("falls back to Company Keeper", () => {
    const s = base();
    setFlag(s, FINALE_SUCCESS);
    setFlag(s, F.coveredUp);
    expect(resolveEnding(s).id).toBe(ENDINGS.keeper.id);
  });

  it("reporting externally without a clean chain gives Cracked Lens", () => {
    const s = base();
    setFlag(s, FINALE_SUCCESS);
    setFlag(s, F.reportedOut);
    setFlag(s, F.chainBroken); // chain was broken earlier
    s.integrity = 10;
    expect(resolveEnding(s).id).toBe(ENDINGS.crackedlens.id);
  });

  it("the ending always matches the evidence choice made in the finale", () => {
    const byChoice: [string, string[]][] = [
      [F.reportedOut, [ENDINGS.lighthouse.id, ENDINGS.crackedlens.id]],
      [F.gaveNadia, [ENDINGS.lowtide.id]],
      [F.coveredUp, [ENDINGS.keeper.id]],
    ];
    for (const [choice, allowed] of byChoice) {
      for (const chain of [F.chainIntact, F.chainBroken]) {
        for (const trusted of [true, false]) {
          for (const integrity of [-6, 0, 3, 8]) {
            const s = base();
            setFlag(s, FINALE_SUCCESS);
            setFlag(s, choice);
            setFlag(s, chain);
            if (trusted) setFlag(s, F.trustNadia);
            s.integrity = integrity;
            expect(allowed).toContain(resolveEnding(s).id);
          }
        }
      }
    }
  });

  it("all five endings are distinct", () => {
    const ids = new Set(Object.values(ENDINGS).map((e) => e.id));
    expect(ids.size).toBe(5);
  });
});

describe("conduct and accuracy", () => {
  it("maps integrity to conduct tiers across the range", () => {
    const at = (n: number): string => {
      const s = freshSave();
      s.integrity = n;
      return conduct(s).tier;
    };
    expect(at(8)).toBe("Exemplary");
    expect(at(4)).toBe("Principled");
    expect(at(1)).toBe("Pragmatic");
    expect(at(-2)).toBe("Compromised");
    expect(at(-5)).toBe("Corrupt");
  });

  it("reports full accuracy before any case, then the clean ratio", () => {
    const s = freshSave();
    expect(accuracy(s)).toBe(1);
    s.totalCloses = 4;
    s.cleanCloses = 3;
    expect(accuracy(s)).toBeCloseTo(0.75);
  });
});

describe("hints", () => {
  it("each hint takes HINT_COST off what the case pays", () => {
    expect(xpForClose(40, { wrongAttempts: 0, botched: false, hints: 0 })).toBe(48);
    expect(xpForClose(40, { wrongAttempts: 0, botched: false, hints: 2 })).toBe(48 - 2 * HINT_COST);
    expect(xpForClose(40, { wrongAttempts: 1, botched: false, hints: 1 })).toBe(40 - HINT_COST);
  });

  it("never pays less than zero", () => {
    expect(xpForClose(20, { wrongAttempts: 0, botched: true, hints: 4 })).toBe(0);
  });
});

describe("rank pacing", () => {
  // what one player sees: the shared cases plus their own track's case
  const forTrack = (d: Dept) => (t: (typeof TICKETS)[number]) =>
    !(t.requires ?? []).some((f) => f.startsWith("track_") && f !== trackFlag(d));
  const cases = (d: Dept, withSides: boolean) =>
    CHAPTERS.flatMap((c) => (withSides ? [...c.main, ...c.side] : c.main))
      .map((id) => TICKETS.find((t) => t.id === id)!)
      .filter(forTrack(d));
  const total = (list: typeof TICKETS, wrongAttempts: number) =>
    list.reduce((sum, t) => sum + xpForClose(t.xp, { wrongAttempts, botched: false }), 0);
  const lead = RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1];
  const senior = RANK_THRESHOLDS[RANK_THRESHOLDS.length - 2];

  it("Lead Analyst is reachable on every track by closing the main cases clean", () => {
    for (const d of DEPTS) expect(total(cases(d, false), 0), d).toBeGreaterThanOrEqual(lead);
  });

  it("Lead Analyst is not handed out for scraping through every case", () => {
    for (const d of DEPTS) expect(total(cases(d, true), 1), d).toBeLessThan(lead);
  });

  it("Senior Analyst is reachable even with one retry on every case", () => {
    for (const d of DEPTS) expect(total(cases(d, true), 1), d).toBeGreaterThanOrEqual(senior);
  });
});

describe("live clock", () => {
  const ticket = { live: { seconds: 300 } } as unknown as Parameters<typeof liveSeconds>[0];

  it("gives the base time on a normal run", () => {
    expect(liveSeconds(ticket, freshSave(), false)).toBe(300);
  });

  it("doubles the time with relaxed timers", () => {
    expect(liveSeconds(ticket, freshSave(), true)).toBe(600);
  });

  it("halves the time after crossing the line", () => {
    const s = freshSave();
    setFlag(s, CROSSED_LINE);
    expect(liveSeconds(ticket, s, false)).toBe(150);
  });

  it("relaxed and crossed cancel out to the base time", () => {
    const s = freshSave();
    setFlag(s, CROSSED_LINE);
    expect(liveSeconds(ticket, s, true)).toBe(300);
  });

  it("hard mode tightens the clock", () => {
    const s = freshSave();
    s.hard = true;
    expect(liveSeconds(ticket, s, false)).toBe(210);
  });
});

describe("run seed", () => {
  it("a save with no seed gets one at load, and keeps it on the next load", () => {
    const old = { ...freshSave(), playerName: "Old" } as Partial<ReturnType<typeof freshSave>>;
    delete old.seed;
    localStorage.setItem("breakwater.save.v1", JSON.stringify(old));
    const first = load();
    expect(Number.isFinite(first.seed)).toBe(true);
    expect(load().seed).toBe(first.seed);
  });
});
