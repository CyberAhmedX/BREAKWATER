import type { Dept, Evidence, Question } from "../engine/types";
import { sha256 } from "../engine/sha256";
import { caseRng, pickOne, between, shuffledBy } from "./logs";

// The last question of every screening is not a question. It is one small
// task on the team's own tool, so a new hire has driven the real thing before
// the first case. Each sitting draws its own data, so a retry is a new task.
// Same house rules as everywhere: documentation addresses, reserved domains.

export interface Practical {
  intro: string; // what the screener says as they turn the screen round
  howTo: string; // one plain line on how to drive the tool
  evidence: Evidence[];
  question: Exclude<Question, { type: "decision" }>;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function soc(r: () => number): Practical {
  const culprit = `203.0.113.${pickOne(r, [21, 45, 118, 200])}`;
  const staff = ["a.reyes", "b.osei", "c.lindgren", "d.mbeki", "e.novak", "f.tanaka"];
  const rows: { t: number; e: Record<string, string> }[] = [];
  const add = (t: number, e: Record<string, string>): void => {
    rows.push({ t, e: { _time: `${pad(Math.floor(t / 60))}:${pad(t % 60)}`, ...e } });
  };
  staff.forEach((user, i) => add(8 * 60 + between(r, 0, 50), { user, src_ip: `198.51.100.${20 + i}`, action: "success" }));
  // two people who mistyped once, so one failure alone means nothing
  for (const i of [1, 4]) add(8 * 60 + between(r, 0, 50), { user: staff[i], src_ip: `198.51.100.${20 + i}`, action: "failure" });
  const tries = between(r, 6, 9);
  for (let i = 0; i < tries; i++) add(3 * 60 + 12 + i, { user: staff[i % staff.length], src_ip: culprit, action: "failure" });
  rows.sort((a, b) => a.t - b.t);
  return {
    intro: "Last one is not a question. This is a morning of sign-ins at a client. One address is behind most of the failures. Find it for me.",
    howTo: "Type a search and press Enter. Start with action=failure, then count by address: action=failure | stats count by src_ip | sort -count",
    evidence: [{ kind: "siem", id: "ev_practical_siem", label: "SIEM: sign-ins this morning", index: "signins", fields: ["user", "src_ip", "action"], events: rows.map((x) => x.e) }],
    question: {
      type: "typed",
      id: "iv_soc_practical",
      prompt: "Which address is behind most of the failed sign-ins?",
      answer: [culprit],
      placeholder: "IP address",
      explainRight: `Right. ${culprit} fails ${tries} times in a few minutes, against one account after another. The two failures from town are people mistyping once.`,
      explainWrong: `It is ${culprit}: ${tries} failures in a few minutes, against one account after another. Count failures by address and it stands well above a couple of typos.`,
      solution: { evidence: "ev_practical_siem", command: "action=failure | stats count by src_ip | sort -count" },
    },
  };
}

function helpdesk(r: () => number): Practical {
  const lookalike = r() < 0.5;
  const from = lookalike ? "Lanternhouse Help Desk <helpdesk@lanternhouse-support.test>" : "Lanternhouse Help Desk <helpdesk@lanternhouse.example>";
  return {
    intro: "Last one is not a question. A client forwarded this and asked if it is really from us. Show me the one line that settles it.",
    howTo: "Press Pick in the evidence, then click the line you mean.",
    evidence: [
      {
        kind: "email",
        id: "ev_practical_mail",
        label: "Forwarded email",
        from,
        to: "Front Desk <frontdesk@stbrennans.example>",
        date: "Tue 16:52",
        subject: "Mailbox almost full, action needed today",
        headers: lookalike ? undefined : { "Reply-To": "it-desk@mailbox-reset.test" },
        body: ["Your mailbox is almost full and will stop receiving mail tonight.", "Reply to this message and we will raise your limit before the end of the day."],
      },
      {
        kind: "note",
        id: "ev_practical_dir",
        label: "What you know",
        title: "The real help desk",
        lines: ["The help desk only ever writes from helpdesk@lanternhouse.example.", "Replies to the help desk go back to that same address."],
      },
    ],
    question: {
      type: "spot",
      id: "iv_helpdesk_practical",
      prompt: lookalike ? "Click the line that shows this did not come from Lanternhouse's own mail domain." : "Click the line that shows where her reply would really go.",
      evidence: "ev_practical_mail",
      answer: [lookalike ? "h:From" : "h:Reply-To"],
      explainRight: lookalike
        ? "Right. lanternhouse-support.test is not lanternhouse.example. A lookalike domain in the From line, and everything after it is a stranger's words."
        : "Right. The From line looks like us, but Reply-To sends her answer to mailbox-reset.test. Whoever replies is talking to someone else.",
      explainWrong: lookalike
        ? "It is the From line. The domain is lanternhouse-support.test, which looks close to ours and is not. The body sounds urgent, but urgency alone does not prove who sent it."
        : "It is the Reply-To line. The From address looks right, but a reply would go to mailbox-reset.test, which is not us.",
    },
  };
}

function network(r: () => number): Practical {
  const v = pickOne(r, [
    { a: "lab", aNet: "10.40.7.0/24", aHost: "10.40.7.21", b: "office", bNet: "10.40.1.0/24", bHost: "10.40.1.5", aName: "the student lab", bName: "the school office" },
    { a: "guest", aNet: "192.168.60.0/24", aHost: "192.168.60.33", b: "tills", bNet: "10.30.1.0/24", bHost: "10.30.1.15", aName: "the guest wifi", bName: "the tills" },
    { a: "cameras", aNet: "10.70.0.0/24", aHost: "10.70.0.12", b: "servers", bNet: "10.10.8.0/24", bHost: "10.10.8.4", aName: "the cameras", bName: "the servers" },
  ]);
  return {
    intro: `Last one is not a question. Somebody wrote these three rules, and ${v.aName} can still reach ${v.bName}. Fix it without cutting ${v.aName} off from the internet.`,
    howTo: "Edit the rules, then press Replay traffic. Rules are read top to bottom and the first match wins.",
    evidence: [
      {
        kind: "firewall",
        id: "ev_practical_fw",
        label: "A small firewall",
        zones: { [v.a]: [v.aNet], [v.b]: [v.bNet] },
        rules: [`allow from ${v.a} to any`, `deny from ${v.a} to ${v.b}`, "deny from any to any"].join("\n"),
        flows: [
          { what: `${cap(v.aName)} reaching the web`, src: v.aHost, dst: "198.51.100.200", port: 443, proto: "tcp", want: "allow" },
          { what: `${cap(v.aName)} reaching into ${v.bName}`, src: v.aHost, dst: v.bHost, port: 445, proto: "tcp", want: "deny" },
        ],
      },
    ],
    question: {
      type: "rules",
      id: "iv_network_practical",
      prompt: `Fix the rules so ${v.aName} can reach the internet but never ${v.bName}.`,
      evidence: "ev_practical_fw",
      solution: [`deny from ${v.a} to ${v.b}`, `allow from ${v.a} to any`, "deny from any to any"].join("\n"),
      explainRight: "Right. The deny was already there. It sat below a broad allow, so it never got a say. Order is most of what a firewall is.",
      explainWrong: "Move the deny above the allow. The first matching rule wins, so a block placed below a broad allow never runs.",
    },
  };
}

function forensics(r: () => number): Practical {
  const sealed = [
    "Clinic reception PC, disk image",
    `Acquired through a write blocker, ${pickOne(r, ["Monday 10:40", "Tuesday 09:15", "Wednesday 14:05", "Thursday 11:30"])}.`,
    "119 GB, NTFS.",
  ].join("\n") + "\n";
  const later = sealed + "Opened again on a running PC the day after.\n";
  const sealedIsFirst = r() < 0.5;
  const names = ["image_first.img", "image_second.img"];
  const sealedName = sealedIsFirst ? names[0] : names[1];
  const hash = sha256(sealed);
  return {
    intro: "Last one is not a question. Two copies of the same disk, and the hash that was written on the evidence tag when it was sealed. Tell me which copy I can still trust.",
    howTo: "Type a command and press Enter. Try: cat tag.txt, then sha256sum image_first.img image_second.img, and compare.",
    evidence: [
      {
        kind: "terminal",
        id: "ev_practical_box",
        label: "Forensic workstation",
        files: { "tag.txt": `${hash}  written on the evidence tag when the disk was sealed\n`, [names[0]]: sealedIsFirst ? sealed : later, [names[1]]: sealedIsFirst ? later : sealed },
      },
    ],
    question: {
      type: "typed",
      id: "iv_forensics_practical",
      prompt: "Which copy still matches the hash on the evidence tag? Type its file name.",
      answer: [sealedName, sealedName.replace(".img", ""), sealedIsFirst ? "first" : "second"],
      placeholder: "File name",
      explainRight: `Right. ${sealedName} gives the same SHA-256 as the tag, so not one bit has changed since it was sealed. The other copy was touched, and its hash shows it.`,
      explainWrong: `It is ${sealedName}. Its SHA-256 is the one on the tag. The other copy gives a different hash, which means it changed after sealing and cannot be your evidence.`,
      solution: { evidence: "ev_practical_box", command: `sha256sum ${names[0]} ${names[1]} | grep ${hash.slice(0, 12)}` },
    },
  };
}

function pentest(r: () => number): Practical {
  const base = pickOne(r, [8, 40, 72, 104]);
  const at = (n: number): string => `198.51.100.${base + n}`;
  const targets = shuffledBy(r, [
    { address: at(1), what: "the client's website" },
    { address: at(6), what: "a login page the scan found" },
    { address: at(8), what: "a server with the client's logo on it" },
    { address: "10.0.0.5", what: "an internal address from an error page" },
  ]);
  return {
    intro: "Last one is not a question. This is a real authorization letter with the client's name taken off. Before you send one packet, tell me which of these you may touch.",
    howTo: "Type an address, or the whole range, into the scope checker and press Enter. Tick only what comes back in scope.",
    evidence: [
      {
        kind: "scope",
        id: "ev_practical_scope",
        label: "Scope checker",
        note: `The letter says: in scope, ${at(0)}/29, tested from the internet. Nothing else.`,
        inScope: [`${at(0)}/29`],
        outOfScope: [],
      },
    ],
    question: {
      type: "scope",
      id: "iv_pentest_practical",
      prompt: "Tick only the addresses this letter lets you test.",
      evidence: "ev_practical_scope",
      targets,
      explainRight: `Right. A /29 is eight addresses, .${base} to .${base + 7}. The server at .${base + 8} is one past the end, logo or no logo, and the internal address was never on the letter.`,
      explainWrong: `${at(0)}/29 covers .${base} to .${base + 7} and nothing else. .${base + 8} is one address past the end, and anything the letter does not name is out.`,
    },
  };
}

function intel(r: () => number): Practical {
  const start = pickOne(r, ["parcel-notice.test", "invoice-desk.test", "login-refresh.test"]);
  const other = pickOne(r, ["secure-mail-check.test", "docs-share-view.test", "account-verify-now.test"]);
  const ip = `203.0.113.${between(r, 120, 140)}`;
  return {
    intro: "Last one is not a question. This domain turned up in a phishing email this morning. One name is never the whole story. Show me what else lives where it lives.",
    howTo: "Type a name or an address and press Enter, or click any result to follow it.",
    evidence: [
      {
        kind: "pivot",
        id: "ev_practical_pivot",
        label: "Passive DNS board",
        caption: "Which names pointed at which addresses, and when.",
        start,
        db: {
          records: [
            { domain: start, ip, firstSeen: "2026-03-02", lastSeen: "2026-03-14", note: "the link in the phishing email" },
            { domain: other, ip, firstSeen: "2026-03-05", lastSeen: "2026-03-14" },
            { domain: "reading-portal.example", ip: "198.51.100.66", firstSeen: "2024-05-01", lastSeen: "2026-03-14", note: "a real school supplier, unrelated" },
          ],
        },
      },
    ],
    question: {
      type: "typed",
      id: "iv_intel_practical",
      prompt: `Look up ${start}, follow its address, and name the other domain on that address.`,
      answer: [other, other.replace(/\.test$/, "")],
      placeholder: "A domain",
      explainRight: `Right. ${start} sits on ${ip}, and so does ${other}. Block the address and you cover both, including the one nobody has reported yet.`,
      explainWrong: `It is ${other}. Look up ${start} to find its address, ${ip}, then look up that address to see every name on it.`,
      solution: { evidence: "ev_practical_pivot", command: ip },
    },
  };
}

const BUILD: Record<Dept, (r: () => number) => Practical> = { soc, helpdesk, network, forensics, pentest, intel };

/**
 * The hands-on task for one sitting of a team's screening. The draw follows
 * the run's seed and how many screenings have been failed, so the game and
 * the browser tests agree on it and a retry gets a different one.
 */
export function practicalFor(dept: Dept, seed: number, fails: number): Practical {
  return BUILD[dept](caseRng((seed + fails * 7919) >>> 0, `practical_${dept}`));
}
