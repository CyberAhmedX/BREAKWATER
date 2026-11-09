// Generated case files: logs too long to read by eye, built from a fixed seed so
// every player (and every test) sees exactly the same lines. Only documentation
// and private addresses, and only .example / .test domains, as everywhere else.

/** Small seeded random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A generator for one case in one run. Each case gets its own stream from the
 * run's seed, so changing how one case draws never shifts another.
 */
export function caseRng(seed: number, caseId: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < caseId.length; i++) {
    h ^= caseId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return rng((seed ^ h) >>> 0);
}

/** One item of a list, chosen by the generator. */
export function pickOne<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

/** A whole number from lo to hi, both included. */
export function between(r: () => number, lo: number, hi: number): number {
  return lo + Math.floor(r() * (hi - lo + 1));
}

/** A shuffled copy of a list (Fisher-Yates), in the generator's order. */
export function shuffledBy<T>(r: () => number, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const clock = (secs: number): string => `${pad(Math.floor(secs / 3600) % 24)}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;

// ------------------------------------------------------------------ school DNS

const SCHOOL_DOMAINS = [
  "mail.halden-schools.example",
  "learn.halden-schools.example",
  "updates.halden-schools.example",
  "time.halden-schools.example",
  "cdn.reading-portal.example",
  "www.reading-portal.example",
  "video.lesson-hub.example",
  "api.lesson-hub.example",
  "fonts.web-assets.example",
  "maps.town-guide.example",
];

// Exfil-looking names the tunnel can hide under. All reserved .example, and
// none overlaps SCHOOL_DOMAINS, so a grep for the tunnel domain only catches
// the tunnel.
const TUNNEL_DOMAINS = [
  "sync-telemetry.example",
  "metrics-collect.example",
  "beacon-sync.example",
  "telemetry-hub.example",
  "data-relay.example",
  "node-sync.example",
];

export interface SchoolDns {
  log: string;
  tunnelDomain: string;
  tunnelCount: number;
  tunnelHost: string;
  tunnelIp: string;
}

/**
 * Twenty minutes of the school resolver's log. Twelve lab PCs browse normally;
 * one of them also sends a steady stream of TXT lookups for random names under
 * data.<tunnel domain>, which is the tunnel.
 *
 * Seeded per run: which lab PC is the tunnel, which domain it talks to, how many
 * lookups it makes, and all the ordinary noise. The tunnel domains are reserved
 * and distinct from the normal ones, so the lookup count stays easy to grep.
 */
export function schoolDnsLog(seed: number): SchoolDns {
  const r = rng(seed);
  const tunnelPc = 1 + Math.floor(r() * 12);
  const tunnelHost = `lab-pc-${pad(tunnelPc)}`;
  const tunnelIp = `10.40.7.${100 + tunnelPc}`;
  const tunnelDomain = TUNNEL_DOMAINS[Math.floor(r() * TUNNEL_DOMAINS.length)];
  const rows: { t: number; line: string }[] = [];
  const start = 13 * 3600;
  for (let pc = 1; pc <= 12; pc++) {
    const host = `lab-pc-${pad(pc)}`;
    const ip = `10.40.7.${100 + pc}`;
    const n = 45 + Math.floor(r() * 40);
    for (let i = 0; i < n; i++) {
      const t = start + Math.floor(r() * 1200);
      const q = SCHOOL_DOMAINS[Math.floor(r() * SCHOOL_DOMAINS.length)];
      rows.push({ t, line: `${clock(t)}\t${host}\t${ip}\t${q}\t${r() < 0.85 ? "A" : "AAAA"}\tNOERROR` });
    }
  }
  let tunnelCount = 0;
  for (let t = start + 7; t < start + 1200; t += 2 + Math.floor(r() * 2)) {
    const label = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(r() * 36)]).join("");
    rows.push({ t, line: `${clock(t)}\t${tunnelHost}\t${tunnelIp}\t${label}.data.${tunnelDomain}\tTXT\tNOERROR` });
    tunnelCount++;
  }
  rows.sort((a, b) => a.t - b.t);
  const header = "#fields\ttime\thost\tsrc_ip\tquery\tqtype\trcode";
  return { log: [header, ...rows.map((x) => x.line)].join("\n") + "\n", tunnelDomain, tunnelCount, tunnelHost, tunnelIp };
}

// ------------------------------------------------------------------ clinic VPN

const CLINIC_STAFF = [
  "a.reyes", "b.osei", "c.lindgren", "d.mbeki", "e.novak", "f.tanaka", "g.walsh", "h.ibrahim", "i.kowalski", "j.mensah",
  "k.duarte", "l.fischer", "m.haddad", "n.oconnor", "o.petrov", "p.sato", "q.adeyemi", "r.silva", "s.nguyen", "t.berg",
  "u.rahman", "v.costa", "w.yilmaz", "x.moreau", "y.kim", "z.okeke", "ab.jensen", "ac.ferrari", "ad.novak", "ae.chowdhury",
  "af.lund", "ag.santos", "ah.mwangi", "ai.dubois", "aj.park", "ak.ortiz", "al.weber", "am.hussain", "an.rossi", "ao.byrne",
];
// names an attacker guesses that do not exist here
const GUESSED = ["admin", "administrator", "test", "reception", "billing", "itsupport", "scanner", "backup", "nurse1", "doctor", "manager", "guest"];

export interface ClinicVpn {
  events: Record<string, string>[];
  fields: string[];
  sprayIp: string;
  sprayAccounts: number;
  breached: string;
}

/**
 * A day of the clinic's VPN sign-ins. Staff connect from home addresses in
 * town, a night nurse signs in at two, b.osei fumbles a password before work,
 * and at 03:12 one hosting address tries one password against every account it
 * can think of. One staff member is still on their first-day password.
 *
 * Seeded per run: the breached account, the staff home addresses, the per-user
 * login counts and times, and how many accounts the spray tries all vary. The
 * spray address stays 203.0.113.77, the recurring infrastructure across the
 * whole game, and so does the clinic's red-herring password fumble.
 */
export function clinicVpnEvents(seed: number): ClinicVpn {
  const r = rng(seed);
  // These three are fixed story beats, never the breached account.
  const RESERVED = ["b.osei", "k.duarte", "s.nguyen"];
  const candidates = CLINIC_STAFF.filter((u) => !RESERVED.includes(u));
  const breached = candidates[Math.floor(r() * candidates.length)];
  const rows: { t: number; e: Record<string, string> }[] = [];
  const home = (i: number): string => `198.51.100.${10 + (i % 50)}`;
  const add = (t: number, e: Record<string, string>): void => {
    rows.push({ t, e: { _time: clock(t), ...e } });
  };

  // the VPN drops and reconnects through the day, so each person signs in a few times
  CLINIC_STAFF.forEach((user, i) => {
    const n = 4 + Math.floor(r() * 7);
    for (let k = 0; k < n; k++) {
      const t = 7 * 3600 + Math.floor(r() * 11 * 3600);
      add(t, { src_ip: home(i), user, action: "success", reason: "", geo: "Port Halden" });
    }
  });
  add(2 * 3600 + 4 * 60 + 11, { src_ip: "198.51.100.31", user: "h.ibrahim", action: "success", reason: "", geo: "Port Halden" });
  // the red herring: a real person who cannot remember their new password
  for (const [s, action, reason] of [[7 * 3600 + 58 * 60 + 2, "failure", "bad password"], [7 * 3600 + 58 * 60 + 40, "failure", "bad password"], [7 * 3600 + 59 * 60 + 15, "failure", "bad password"], [7 * 3600 + 59 * 60 + 58, "success", ""]] as const) {
    add(s, { src_ip: "198.51.100.23", user: "b.osei", action, reason, geo: "Port Halden" });
  }
  // a couple more ordinary typos during the day
  for (const user of ["k.duarte", "s.nguyen"]) {
    const t = 9 * 3600 + Math.floor(r() * 6 * 3600);
    const i = CLINIC_STAFF.indexOf(user);
    add(t, { src_ip: home(i), user, action: "failure", reason: "bad password", geo: "Port Halden" });
    add(t + 20, { src_ip: home(i), user, action: "success", reason: "", geo: "Port Halden" });
  }

  // the spray: one try per account, from the recurring hosting address
  const sprayIp = "203.0.113.77";
  const guessedN = 8 + Math.floor(r() * (GUESSED.length - 7)); // 8..GUESSED.length, keeps admin/reception
  const targets = [...CLINIC_STAFF, ...GUESSED.slice(0, guessedN)];
  let t = 3 * 3600 + 12 * 60 + 1;
  for (const user of targets) {
    const known = CLINIC_STAFF.includes(user);
    const ok = user === breached;
    add(t, { src_ip: sprayIp, user, action: ok ? "success" : "failure", reason: ok ? "" : known ? "bad password" : "unknown user", geo: "Unknown (hosting provider)" });
    t += 1 + Math.floor(r() * 3);
  }

  rows.sort((a, b) => a.t - b.t);
  return {
    events: rows.map((x) => x.e),
    fields: ["src_ip", "user", "action", "reason", "geo"],
    sprayIp,
    sprayAccounts: targets.length,
    breached,
  };
}

// ------------------------------------------------------------------ HarborWatch alerts

const HW_CLIENTS = ["clinic", "school", "harbor", "bakery", "water plant"];

export interface HwAlerts {
  events: Record<string, string>[];
  fields: string[];
  total: number;
  outside: number; // how many came from outside the office network
  outsideIp: string;
}

/**
 * One stormy night of "shared HarborWatch login used" alerts, the ones Walter
 * calls noise. Most are staff on the office network, 10.50.0.0/16, checking on
 * clients. A handful are the same login used from the recurring hosting
 * address. Seeded per run: how busy the night is and how many are from outside.
 */
export function hwAlertEvents(seed: number): HwAlerts {
  const r = caseRng(seed, "t4_soc");
  const rows: { t: number; e: Record<string, string> }[] = [];
  const outsideIp = "203.0.113.77";
  const inside = between(r, 38, 64);
  for (let i = 0; i < inside; i++) {
    const t = 18 * 3600 + Math.floor(r() * 5 * 3600);
    rows.push({ t, e: { _time: clock(t), account: "hw-admin", src_ip: `10.50.1.${between(r, 11, 24)}`, client: pickOne(r, HW_CLIENTS) } });
  }
  const outside = between(r, 3, 6);
  for (let i = 0; i < outside; i++) {
    const t = 20 * 3600 + Math.floor(r() * 3 * 3600);
    rows.push({ t, e: { _time: clock(t), account: "hw-admin", src_ip: outsideIp, client: i === 0 ? "water plant" : pickOne(r, HW_CLIENTS) } });
  }
  rows.sort((a, b) => a.t - b.t);
  return { events: rows.map((x) => x.e), fields: ["account", "src_ip", "client"], total: rows.length, outside, outsideIp };
}
