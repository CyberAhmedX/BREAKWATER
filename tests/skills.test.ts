import { describe, it, expect } from "vitest";
import { freshSave, setFlag } from "../src/engine/state";
import { SKILL_ORDER, skillsFileName, skillsHtml, skillsOf, skillsSummary } from "../src/engine/skills";
import { TICKETS } from "../src/content/tickets";
import { CODEX } from "../src/content/codex";
import { QUEUE } from "../src/content/queue";
import { CHAPTERS } from "../src/content/chapters";
import { ENDINGS } from "../src/engine/endings";
import { DEPTS } from "../src/engine/types";
import { trackFlag } from "../src/engine/state";

const src = { tickets: TICKETS, codex: CODEX, queue: QUEUE };
const run = (done: string[]): ReturnType<typeof freshSave> => ({ ...freshSave(), playerName: "Riley", track: "pentest", hired: true, done, totalCloses: done.length, cleanCloses: done.length });

describe("skills summary", () => {
  it("is empty before any case is closed", () => {
    const sum = skillsSummary(run([]), src);
    expect(sum.closed).toBe(0);
    expect(sum.tools).toEqual([]);
    expect(sum.techniques).toEqual([]);
    expect(sum.ending).toBe("");
  });

  it("lists each tool with the cases it was used on, and counts techniques once", () => {
    const sum = skillsSummary(run(["t1_bakery_phish", "t2_bakery_bec", "t3_pentest_lab", "t4_harbor_pentest"]), src);
    expect(sum.closed).toBe(4);
    const tool = (name: string): string[] => sum.tools.find((t) => t.tool.startsWith(name))?.cases ?? [];
    expect(tool("HTTP requests")).toEqual(["How did they get in?", "Authorized test, with a hard line"]);
    expect(tool("CVSS")).toHaveLength(2);
    expect(tool("Raw email headers")).toEqual(["Weird email from the owner"]);
    expect(tool("SIEM")).toEqual([]);
    // T1078 Valid Accounts is tagged on two of these cases, and listed once
    const valid = sum.techniques.filter((t) => t.id === "T1078");
    expect(valid).toHaveLength(1);
    expect(valid[0].cases).toBe(2);
    expect(sum.techniques.map((t) => t.id)).toEqual([...sum.techniques.map((t) => t.id)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  });

  it("a botched case earns nothing", () => {
    const s = run(["t3_pentest_lab", "t4_harbor_pentest"]);
    setFlag(s, "botched_t3_pentest_lab");
    const sum = skillsSummary(s, src);
    expect(sum.closed).toBe(1);
    expect(sum.tools.find((t) => t.tool.startsWith("HTTP requests"))?.cases).toEqual(["Authorized test, with a hard line"]);
    expect(sum.techniques.some((t) => t.id === "T1133")).toBe(false);
  });

  it("only names concepts whose field note was unlocked, and carries the ending once there is one", () => {
    const s = run(["t1_bakery_phish"]);
    s.codex = ["phishing", "not-a-real-note"];
    const sum = skillsSummary(s, { ...src, ending: ENDINGS.lighthouse });
    expect(sum.concepts).toEqual([CODEX.find((c) => c.id === "phishing")!.term]);
    expect(sum.ending).toBe("The Lighthouse");
  });

  it("every team's full run uses several tools, and every hands-on case counts for something", () => {
    for (const d of DEPTS) {
      const mine = CHAPTERS.flatMap((c) => [...c.main, ...c.side]).filter((id) => !(TICKETS.find((t) => t.id === id)!.requires ?? []).some((f) => f.startsWith("track_") && f !== trackFlag(d)));
      const sum = skillsSummary({ ...run(mine), track: d }, src);
      expect(sum.tools.length, d).toBeGreaterThanOrEqual(3);
      expect(sum.techniques.length, d).toBeGreaterThanOrEqual(10);
    }
    for (const s of TICKETS.flatMap(skillsOf)) expect(SKILL_ORDER).toContain(s);
  });
});

describe("skills page", () => {
  const sum = skillsSummary({ ...run(["t1_bakery_phish", "t3_pentest_lab", "t4_harbor_pentest"]), codex: ["phishing", "cvss"] }, { ...src, ending: ENDINGS.lowtide });

  it("is one self-contained page: no scripts, no outside requests", () => {
    const html = skillsHtml(sum, "9 November 2026");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/\b(src|href)=/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).toContain("Riley");
    expect(html).toContain("Low Tide");
    expect(html).toContain("T1190");
    expect(html).toContain("It is not a certificate or a qualification.");
    expect(html).not.toMatch(/[–—]/);
  });

  it("escapes the player's name, which is free text", () => {
    const evil = { ...sum, player: `<img src=x onerror="alert(1)">&'` };
    const html = skillsHtml(evil, "today");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
  });

  it("names the file after the player, safely", () => {
    expect(skillsFileName("Riley")).toBe("breakwater-skills-Riley.html");
    expect(skillsFileName("../../etc/passwd")).toBe("breakwater-skills-etc-passwd.html");
    expect(skillsFileName("   ")).toBe("breakwater-skills-analyst.html");
  });
});
