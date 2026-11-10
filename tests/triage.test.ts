import { describe, it, expect } from "vitest";
import { freshSave, hasFlag } from "../src/engine/state";
import { type QueueAlert, ageOut, callOn, caughtFlag, decide, looksAllowed, looksLeft, missedFlag, openAlert, queueOpen, rightCall, triageStats, waiting } from "../src/engine/triage";
import { QUEUE, queueFor } from "../src/content/queue";
import { ACHIEVEMENTS } from "../src/engine/achievements";
import { freshMeta } from "../src/engine/meta";
import { makeBundle, bundleToFile, readSave } from "../src/engine/transfer";

const alert = (id: string, real: boolean): QueueAlert => ({ id, chapter: 2, severity: "low", title: id, source: "x", details: ["a", "b"], real, why: "because" });
const queue = [alert("r1", true), alert("r2", true), alert("b1", false), alert("b2", false), alert("b3", false)];

describe("alert queue rules", () => {
  it("there is time to open three, two on hard mode", () => {
    expect(looksAllowed(freshSave())).toBe(3);
    expect(looksAllowed({ ...freshSave(), hard: true })).toBe(2);
  });

  it("opening spends a look, and the looks run out", () => {
    const s = freshSave();
    expect(looksLeft(s, queue)).toBe(3);
    expect(openAlert(s, queue, queue[0])).toBe(true);
    expect(openAlert(s, queue, queue[0]), "already open").toBe(false);
    expect(looksLeft(s, queue)).toBe(2);
    expect(openAlert(s, queue, queue[2])).toBe(true);
    expect(openAlert(s, queue, queue[3])).toBe(true);
    expect(looksLeft(s, queue)).toBe(0);
    expect(openAlert(s, queue, queue[1]), "no time left").toBe(false);
    expect(callOn(s, queue[1])).toBeUndefined();
    expect(waiting(s, queue).map((a) => a.id)).toEqual(["r2", "b3"]);
  });

  it("a call can only be made on an opened alert, and only once", () => {
    const s = freshSave();
    expect(decide(s, queue[0], "escalated"), "never opened").toBe(false);
    expect(callOn(s, queue[0])).toBeUndefined();
    openAlert(s, queue, queue[0]);
    expect(decide(s, queue[0], "closed")).toBe(false);
    expect(callOn(s, queue[0])).toBe("closed");
    // changing your mind afterwards does nothing
    decide(s, queue[0], "escalated");
    expect(callOn(s, queue[0])).toBe("closed");
    expect(hasFlag(s, missedFlag("r1"))).toBe(true);
    expect(hasFlag(s, caughtFlag("r1"))).toBe(false);
  });

  it("escalating a real alert is right, closing a benign one is right, and nothing else is", () => {
    expect(rightCall(queue[0], "escalated")).toBe(true);
    expect(rightCall(queue[0], "closed")).toBe(false);
    expect(rightCall(queue[0], "aged")).toBe(false);
    expect(rightCall(queue[2], "closed")).toBe(true);
    expect(rightCall(queue[2], "escalated")).toBe(false);
  });

  it("the day ending ages out what was not called, and a real one left behind is missed", () => {
    const s = freshSave();
    openAlert(s, queue, queue[0]);
    decide(s, queue[0], "escalated");
    openAlert(s, queue, queue[2]); // opened, never called
    expect(queueOpen(s, queue)).toBe(true);
    ageOut(s, queue);
    expect(queue.map((a) => callOn(s, a))).toEqual(["escalated", "aged", "aged", "aged", "aged"]);
    expect(hasFlag(s, caughtFlag("r1"))).toBe(true);
    expect(hasFlag(s, missedFlag("r2"))).toBe(true);
    expect(hasFlag(s, missedFlag("b1")), "a benign alert is never missed").toBe(false);
    expect(queueOpen(s, queue)).toBe(false);
    // ending the day twice changes nothing
    const before = JSON.stringify(s);
    ageOut(s, queue);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("the queue is open while there is an alert to open or a call to make", () => {
    const s = freshSave();
    expect(queueOpen(s, queue)).toBe(true);
    for (const a of queue.slice(0, 3)) openAlert(s, queue, a);
    expect(queueOpen(s, queue), "three open, none called").toBe(true);
    for (const a of queue.slice(0, 3)) decide(s, a, a.real ? "escalated" : "closed");
    expect(queueOpen(s, queue), "no looks left").toBe(false);
    expect(queueOpen(freshSave(), [])).toBe(false);
  });

  it("counts what was caught, what was missed and who cried wolf", () => {
    const s = freshSave();
    openAlert(s, queue, queue[0]);
    decide(s, queue[0], "escalated");
    openAlert(s, queue, queue[2]);
    decide(s, queue[2], "escalated"); // cried wolf
    openAlert(s, queue, queue[3]);
    decide(s, queue[3], "closed");
    expect(triageStats(s, queue)).toEqual({ real: 0 + 1, caught: 1, missed: 0, rightCalls: 2, calls: 3, criedWolf: 1 });
    ageOut(s, queue);
    expect(triageStats(s, queue)).toEqual({ real: 2, caught: 1, missed: 1, rightCalls: 2, calls: 3, criedWolf: 1 });
  });
});

describe("alert queue across a run", () => {
  const perfect = (hard: boolean): ReturnType<typeof freshSave> => {
    const s = { ...freshSave(), hard, hired: true };
    for (const ch of [2, 3, 4, 5] as const) {
      const q = queueFor(ch, s.seed);
      for (const a of q.filter((x) => x.real)) {
        expect(openAlert(s, q, a), `${a.id} can be opened`).toBe(true);
        expect(decide(s, a, "escalated")).toBe(true);
      }
      ageOut(s, q);
    }
    return s;
  };

  it("every real alert can be caught in one run, on hard mode too", () => {
    for (const hard of [false, true]) {
      const s = perfect(hard);
      const st = triageStats(s, QUEUE);
      expect(st.real).toBe(QUEUE.filter((a) => a.real).length);
      expect(st.caught).toBe(st.real);
      expect(st.missed).toBe(0);
    }
  });

  it("Signal and Noise needs every real alert, and a finished run", () => {
    const signal = ACHIEVEMENTS.find((a) => a.id === "signal")!;
    const s = perfect(false);
    expect(signal.earned(s, freshMeta()), "not finished yet").toBe(false);
    s.chapter = 6;
    expect(signal.earned(s, freshMeta())).toBe(true);
    const lazy = { ...freshSave(), hired: true, chapter: 6 as const };
    for (const ch of [2, 3, 4, 5] as const) ageOut(lazy, queueFor(ch, lazy.seed));
    expect(signal.earned(lazy, freshMeta())).toBe(false);
    expect(triageStats(lazy, QUEUE).missed).toBe(QUEUE.filter((a) => a.real).length);
  });

  it("travels with an exported save, and junk in an imported one is dropped", async () => {
    const s = perfect(false);
    s.playerName = "Riley";
    s.track = "soc";
    s.chapter = 5;
    const back = await readSave(bundleToFile(makeBundle(s, freshMeta())));
    expect(back.ok && back.save.triage).toEqual(s.triage);

    const dirty = { ...s, triage: { ...s.triage, q2_travel: "deleted", "": "closed", x: 7 } } as unknown as typeof s;
    const cleaned = await readSave(bundleToFile(makeBundle(dirty, freshMeta())));
    expect(cleaned.ok).toBe(true);
    if (cleaned.ok) {
      expect(cleaned.save.triage.q2_travel).toBeUndefined();
      expect(Object.keys(cleaned.save.triage)).not.toContain("");
      expect(Object.keys(cleaned.save.triage)).not.toContain("x");
    }
  });
});
