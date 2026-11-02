import { describe, it, expect, beforeEach } from "vitest";
import { freshSave, setFlag, wipe } from "../src/engine/state";
import {
  freshMeta,
  loadMeta,
  saveMeta,
  wipeMeta,
  recordEnding,
  recordCases,
  recordCheckpoint,
  checkpointCopy,
  canSelectChapter,
} from "../src/engine/meta";
import { ACHIEVEMENTS, checkAchievements } from "../src/engine/achievements";
import { ENDINGS, ENDING_ORDER, F } from "../src/engine/endings";

describe("meta save", () => {
  beforeEach(() => {
    wipe();
    wipeMeta();
  });

  it("round-trips settings and endings, and fills in missing settings", () => {
    const m = freshMeta();
    m.settings.music = 0.2;
    recordEnding(m, "keeper");
    saveMeta(m);
    const back = loadMeta();
    expect(back.settings.music).toBe(0.2);
    expect(back.settings.effects).toBe(0.7);
    expect(back.endings).toEqual(["keeper"]);
  });

  it("remembers closed cases once each, for practice", () => {
    const m = freshMeta();
    recordCases(m, ["t1_bakery_phish", "t1_printer"]);
    recordCases(m, ["t1_bakery_phish"]);
    expect(m.casesEver).toEqual(["t1_bakery_phish", "t1_printer"]);
    saveMeta(m);
    expect(loadMeta().casesEver).toEqual(["t1_bakery_phish", "t1_printer"]);
  });

  it("records each ending once", () => {
    const m = freshMeta();
    expect(recordEnding(m, "keeper")).toBe(true);
    expect(recordEnding(m, "keeper")).toBe(false);
    expect(m.endings).toEqual(["keeper"]);
  });

  it("checkpoints are copies, so playing on does not change them", () => {
    const m = freshMeta();
    const s = freshSave();
    s.chapter = 3;
    s.xp = 120;
    recordCheckpoint(m, s);
    s.xp = 999;
    const copy = checkpointCopy(m, 3)!;
    expect(copy.xp).toBe(120);
    copy.xp = 5;
    expect(checkpointCopy(m, 3)!.xp).toBe(120);
  });

  it("opens chapter select only after an ending", () => {
    const m = freshMeta();
    const s = freshSave();
    s.chapter = 1;
    recordCheckpoint(m, s);
    expect(canSelectChapter(m)).toBe(false);
    recordEnding(m, "keeper");
    expect(canSelectChapter(m)).toBe(true);
  });
});

describe("achievements", () => {
  it("have unique ids", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it("are awarded once, from real state", () => {
    const m = freshMeta();
    const s = freshSave();
    expect(checkAchievements(s, m)).toEqual([]);
    s.hired = true;
    setFlag(s, F.chainIntact);
    const got = checkAchievements(s, m).map((a) => a.id);
    expect(got).toContain("first_try");
    expect(got).toContain("chain");
    expect(checkAchievements(s, m)).toEqual([]);
  });

  it("First Impression is not given after a failed screening", () => {
    const m = freshMeta();
    const s = freshSave();
    s.hired = true;
    s.screeningFails = 1;
    expect(checkAchievements(s, m).map((a) => a.id)).not.toContain("first_try");
  });

  it("By the Book needs a finished run with every case clean", () => {
    const m = freshMeta();
    const s = freshSave();
    s.hired = true;
    s.totalCloses = 9;
    s.cleanCloses = 9;
    s.chapter = 5;
    expect(checkAchievements(s, m).map((a) => a.id)).not.toContain("by_the_book");
    s.chapter = 6;
    s.cleanCloses = 8;
    expect(checkAchievements(s, m).map((a) => a.id)).not.toContain("by_the_book");
    s.cleanCloses = 9;
    expect(checkAchievements(s, m).map((a) => a.id)).toContain("by_the_book");
  });

  it("Every Ending needs all five", () => {
    const m = freshMeta();
    const s = freshSave();
    for (const id of ENDING_ORDER.slice(0, -1)) recordEnding(m, id);
    expect(checkAchievements(s, m).map((a) => a.id)).not.toContain("every_ending");
    recordEnding(m, ENDING_ORDER[ENDING_ORDER.length - 1]);
    expect(checkAchievements(s, m).map((a) => a.id)).toContain("every_ending");
  });

  it("the gallery lists every ending exactly once", () => {
    expect([...ENDING_ORDER].sort()).toEqual(Object.keys(ENDINGS).sort());
  });
});
