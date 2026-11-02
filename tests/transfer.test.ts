import { describe, it, expect } from "vitest";
import { freshSave, setFlag } from "../src/engine/state";
import { freshMeta, recordCheckpoint, recordEnding } from "../src/engine/meta";
import { makeBundle, bundleToCode, bundleToFile, readSave, fileName, checksum } from "../src/engine/transfer";

function sample() {
  const s = freshSave();
  s.playerName = "Zoë";
  s.track = "forensics";
  s.hired = true;
  s.chapter = 3;
  s.xp = 312;
  s.integrity = 4;
  s.cleanCloses = 5;
  s.totalCloses = 6;
  s.hintsUsed = 1;
  s.hard = true;
  setFlag(s, "evidence_chain_intact");
  s.done = ["intro_1", "t1_bakery_phish"];
  s.codex = ["phishing", "hashing"];
  const m = freshMeta();
  recordEnding(m, "keeper");
  m.achievements = ["first_try"];
  m.codexEver = ["phishing", "hashing", "triage"];
  m.casesEver = ["t1_bakery_phish"];
  m.settings.music = 0.25;
  m.settings.textScale = 1.15;
  m.settings.reducedMotion = true;
  const cp = { ...s, chapter: 2 as const, xp: 150 };
  recordCheckpoint(m, cp);
  return { s, m };
}

describe("save transfer", () => {
  it("round-trips through a save code", async () => {
    const { s, m } = sample();
    const r = await readSave(await bundleToCode(makeBundle(s, m)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save).toEqual(s);
    expect(r.meta).toEqual(m);
  });

  it("round-trips through a save file", async () => {
    const { s, m } = sample();
    const r = await readSave(bundleToFile(makeBundle(s, m)));
    expect(r.ok && r.save).toEqual(s);
    expect(r.ok && r.meta).toEqual(m);
  });

  it("still reads a code with line breaks and spaces from pasting", async () => {
    const { s, m } = sample();
    const code = await bundleToCode(makeBundle(s, m));
    const mangled = `  ${code.slice(0, 40)}\n${code.slice(40, 90)} \n${code.slice(90)}\n`;
    expect((await readSave(mangled)).ok).toBe(true);
  });

  it("rejects a code cut short", async () => {
    const { s, m } = sample();
    const code = await bundleToCode(makeBundle(s, m));
    const r = await readSave(code.slice(0, code.length - 30));
    expect(r.ok).toBe(false);
  });

  it("rejects an edited file", async () => {
    const { s, m } = sample();
    const file = bundleToFile(makeBundle(s, m)).replace('"xp": 312', '"xp": 99999');
    const r = await readSave(file);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("damaged or edited") });
  });

  it("rejects things that are not saves", async () => {
    for (const text of ["", "hello", "{}", "[1,2]", '{"format":"something-else"}', "DWELL1.!!!!"]) {
      expect((await readSave(text)).ok, JSON.stringify(text)).toBe(false);
    }
  });

  it("asks for an update when the save is from a newer version", async () => {
    const { s, m } = sample();
    const b = { ...makeBundle(s, m), version: 2 };
    const r = await readSave(JSON.stringify(b));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("newer version") });
  });

  it("rebuilds odd values instead of trusting them", async () => {
    const { m } = sample();
    const odd = {
      version: 1,
      playerName: "x".repeat(200),
      track: "wizard",
      hired: false,
      chapter: 42,
      xp: -5,
      integrity: 1e9,
      flags: ["ok", 7, "", "ok"],
      done: "nope",
      codex: [],
      cleanCloses: 3,
      totalCloses: 1,
      extra: "ignored",
    };
    const data = { save: odd, meta: { ...m, settings: { music: 9, effects: 0.5, muted: "yes", textScale: 3, reducedMotion: "sometimes", fastDialogue: "yes" } } };
    const bundle = { format: "breakwater-save", version: 1, exported: "", check: checksum(JSON.stringify(data)), data };
    const r = await readSave(JSON.stringify(bundle));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.playerName.length).toBe(24);
    expect(r.save.track).toBeNull();
    expect(r.save.chapter).toBe(0);
    expect(r.save.xp).toBe(0);
    expect(r.save.integrity).toBe(50);
    expect(r.save.flags).toEqual(["ok"]);
    expect(r.save.done).toEqual([]);
    expect(r.save.totalCloses).toBe(3);
    expect("extra" in r.save).toBe(false);
    expect(r.meta.settings).toEqual({ music: 0.7, effects: 0.5, muted: false, textScale: 1, reducedMotion: null, relaxedTimers: false, fastDialogue: false, skipSeen: false });
  });

  it("names the file after the player and the date", async () => {
    const { s } = sample();
    expect(fileName(s, new Date("2026-10-17T12:00:00Z"))).toBe("breakwater-save-Zo-2026-10-17.json");
    expect(fileName(freshSave(), new Date("2026-10-17T12:00:00Z"))).toBe("breakwater-save-save-2026-10-17.json");
  });

  it("keeps a full run's code short enough to paste on a phone", async () => {
    const { s, m } = sample();
    s.flags = Array.from({ length: 30 }, (_, i) => `story_flag_${i}`);
    s.done = Array.from({ length: 35 }, (_, i) => `case_or_scene_${i}`);
    for (const ch of [1, 2, 3, 4, 5]) recordCheckpoint(m, { ...s, chapter: ch as 1 | 2 | 3 | 4 | 5 });
    const code = await bundleToCode(makeBundle(s, m));
    expect(code.startsWith("BRKW1.")).toBe(true);
    expect(code.length).toBeLessThan(3_000);
  });
});
