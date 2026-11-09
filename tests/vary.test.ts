import { describe, it, expect } from "vitest";
import { clinicVpnEvents, schoolDnsLog } from "../src/content/logs";
import { VARYING_CASES, withRunData } from "../src/content/vary";
import { TICKETS } from "../src/content/tickets";
import { runSolution } from "../src/engine/solution";
import { normalizeAnswer } from "../src/engine/answer";

// Addresses the game is allowed to use: documentation ranges and private space.
const SAFE_IP = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./;

const SEEDS = [1, 42, 1000, 20260310, 2 ** 31, 4294967295];

describe("seeded clinic VPN generator", () => {
  it("is deterministic: same seed gives identical data", () => {
    expect(clinicVpnEvents(42)).toEqual(clinicVpnEvents(42));
  });

  it("different seeds give different data", () => {
    expect(clinicVpnEvents(42)).not.toEqual(clinicVpnEvents(43));
  });

  it("keeps the spray address fixed and every address in a safe range", () => {
    for (const seed of SEEDS) {
      const vpn = clinicVpnEvents(seed);
      expect(vpn.sprayIp).toBe("203.0.113.77");
      for (const e of vpn.events) expect(e.src_ip, `${seed}: ${e.src_ip}`).toMatch(SAFE_IP);
    }
  });

  it("breaches a real staff account, never a fixed-beat account", () => {
    const reserved = ["b.osei", "k.duarte", "s.nguyen"];
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const vpn = clinicVpnEvents(seed);
      expect(reserved).not.toContain(vpn.breached);
      expect(vpn.events.some((e) => e.user === vpn.breached && e.src_ip === vpn.sprayIp && e.action === "success")).toBe(true);
      seen.add(vpn.breached);
    }
    expect(seen.size).toBeGreaterThan(1); // it actually varies
  });
});

describe("seeded school DNS generator", () => {
  it("is deterministic and varies the tunnel per seed", () => {
    expect(schoolDnsLog(42)).toEqual(schoolDnsLog(42));
    const seen = new Set(SEEDS.map((s) => `${schoolDnsLog(s).tunnelHost}|${schoolDnsLog(s).tunnelDomain}`));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("the tunnel host is a lab PC and the lookup count is greppable", () => {
    for (const seed of SEEDS) {
      const dns = schoolDnsLog(seed);
      expect(dns.tunnelHost).toMatch(/^lab-pc-\d{2}$/);
      // grep -c of the tunnel domain must equal the reported count (no collisions)
      const hits = dns.log.split("\n").filter((l) => l.includes(dns.tunnelDomain)).length;
      expect(hits, `${seed}`).toBe(dns.tunnelCount);
    }
  });
});

describe("withRunData resolver", () => {
  it("leaves tickets without run data untouched", () => {
    const other = TICKETS.find((t) => t.id === "t5_network")!;
    expect(withRunData(other, 123)).toBe(other);
  });

  it("rebuilds varying cases so every solution still finds its answer", () => {
    for (const id of VARYING_CASES) {
      const base = TICKETS.find((t) => t.id === id)!;
      for (const seed of SEEDS) {
        const t = withRunData(base, seed);
        for (const q of t.questions) {
          if (q.type !== "typed" || !q.solution) continue;
          const ev = t.evidence.find((e) => e.id === q.solution!.evidence)!;
          const r = runSolution(ev, q.solution.command);
          expect(r.error, `${id}/${seed}/${q.id}: ${r.out}`).toBeFalsy();
          expect(normalizeAnswer(r.out), `${id}/${seed}/${q.id}`).toContain(normalizeAnswer(q.answer[0]));
        }
      }
    }
  });

  it("every varying case is deterministic, keeps its identity, and really does vary", () => {
    expect(VARYING_CASES.length).toBeGreaterThanOrEqual(10);
    for (const id of VARYING_CASES) {
      const base = TICKETS.find((t) => t.id === id)!;
      expect(base, id).toBeDefined();
      const seen = new Set<string>();
      for (const seed of [...SEEDS, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const t = withRunData(base, seed);
        expect(JSON.stringify(withRunData(base, seed)), `${id}/${seed}`).toBe(JSON.stringify(t));
        // what the story and the save depend on never changes
        expect(t.id).toBe(base.id);
        expect(t.title).toBe(base.title);
        expect(t.xp).toBe(base.xp);
        expect(t.requires).toEqual(base.requires);
        expect(t.setFlags).toEqual(base.setFlags);
        expect(t.questions.map((q) => q.id)).toEqual(base.questions.map((q) => q.id));
        seen.add(JSON.stringify(t));
      }
      expect(seen.size, `${id} varies`).toBeGreaterThan(1);
    }
  });

  it("the answers themselves change between runs, not just the wording", () => {
    const answers = (id: string, seed: number): string =>
      JSON.stringify(
        withRunData(TICKETS.find((t) => t.id === id)!, seed).questions.map((q) =>
          q.type === "typed" || q.type === "iocs" || q.type === "spot" ? q.answer : q.type === "rules" ? q.solution : q.type === "scope" ? q.targets : q.type === "attack-map" ? q.items : q.type === "merge" ? withRunData(TICKETS.find((t) => t.id === id)!, seed).evidence.filter((e) => e.kind === "merge") : null,
        ),
      );
    for (const id of VARYING_CASES) {
      const seen = new Set(Array.from({ length: 40 }, (_, seed) => answers(id, seed + 1)));
      expect(seen.size, `${id}: answers vary`).toBeGreaterThan(1);
    }
  });
});
