import type { Evidence, Ticket } from "../engine/types";

// Chapter three, your own team. Everyone helps with the clinic laptop, but each
// team then checks the findings with its own tool and reaches the one piece of
// the truth only that team can see. Forensics' chapter three case is the clinic
// timeline in tickets.ts. Same house rules: documentation addresses, reserved
// domains, nothing real. Evidence is kept short and plain on purpose.

// Dr. Vance's one-page summary, shared with every team so each can check it a
// different way.
const VANCE_MEMO: Evidence = {
  kind: "note",
  id: "ev_vance_memo",
  label: "Dr. Vance's note to the team",
  title: "Clinic laptop: what forensics found",
  lines: [
    "A service account, svc_tidewatch, was added to the clinic server recently.",
    "HarborWatch still uses one shared admin login, hw-admin, and its password has not changed in five years.",
    "Five years ago the clinic was breached and the analyst on the night shift was blamed for missing the alerts.",
    "Please check this from your side. A name in a log is not a person.",
  ],
};

// ---------- SOC: the console's own audit, in the SIEM ----------

const TEAM_SOC: Ticket = {
  id: "t3_soc_alerts",
  chapter: 3,
  dept: "soc",
  severity: "high",
  client: "St. Brennan's Clinic",
  title: "The alerts that never fired",
  xp: 100,
  requires: ["track_soc", "clinic_examined"],
  attack: [
    { id: "T1562.001", name: "Impair Defenses: Disable or Modify Tools" },
    { id: "T1078", name: "Valid Accounts" },
  ],
  brief: [
    "Mags sets a coffee down next to you, which from Mags is a ceremony.",
    "Imani found the shape of it. Our job is to say why the clinic's alerts never reached anyone. I pulled five years of the HarborWatch console's own audit into the SIEM. Read it before you decide anything.",
  ],
  evidence: [
    VANCE_MEMO,
    {
      kind: "siem",
      id: "ev_soc_console",
      label: "SIEM: HarborWatch console audit, five years",
      index: "hw_console",
      fields: ["account", "action", "target", "source"],
      events: [
        { _time: "5y ago", account: "hw-admin", action: "rule-disable", target: "clinic login alerts", source: "ws-abernathy" },
        { _time: "5y ago", account: "i.okafor", action: "view", target: "dashboard", source: "ws-okafor" },
        { _time: "4y ago", account: "hw-admin", action: "login", target: "console", source: "ws-abernathy" },
        { _time: "recent", account: "hw-admin", action: "create", target: "svc_tidewatch", source: "203.0.113.77" },
        { _time: "recent", account: "hw-admin", action: "login", target: "clinic server", source: "203.0.113.77" },
        { _time: "recent", account: "t.lindqvist", action: "view", target: "tickets", source: "ws-theo" },
      ],
    },
  ],
  questions: [
    {
      type: "single",
      id: "q_soc_why",
      prompt: "Why did the clinic's login alerts never reach the analyst on shift?",
      options: [
        "The analyst ignored them, which is why they were let go",
        "A rule in the console had switched those alerts off",
        "The clinic's internet was down that night",
        "There were too many alerts to read them all in time",
      ],
      answer: 1,
      explainRight: "Right. The audit shows the clinic login alerts were disabled in the console. Nothing reached the night shift because the console was told to send nothing. That is not a person missing an alert.",
      explainWrong: "Look at the oldest event. The clinic login alerts were disabled in the console. The analyst never saw them because the console was set to send nothing.",
      teaches: "attribution",
      hint: "Sort the oldest event to the top. What was done to the alert rule, and when?",
    },
    {
      type: "typed",
      id: "q_soc_origin",
      prompt: "The svc_tidewatch account was created recently. Which address was it created from?",
      answer: ["203.0.113.77"],
      placeholder: "An address",
      explainRight: "Right. 203.0.113.77, a hosting address, the same one from the Brightloaf mailbox and the clinic server. Whoever created the account was outside the building, whatever the shared login says.",
      explainWrong: "It is 203.0.113.77. Search for the create action and read its source. It is a hosting address, outside Lanternhouse, and one you have seen before.",
      teaches: "attribution",
      hint: "Search for the create action, then read the source column.",
      solution: { evidence: "ev_soc_console", command: "action=create | table account target source" },
    },
    {
      type: "typed",
      id: "q_soc_secret",
      secret: "secret_soc",
      prompt: "The alerts were not misconfigured, they were switched off by hand. Which workstation did that, five years ago, from inside the office?",
      answer: ["ws-abernathy", "abernathy", "walter"],
      placeholder: "A workstation",
      explainRight: "There it is. ws-abernathy, Walter's own desk, the night of the breach. The alerts were never a mistake. Someone inside the building turned them off and let a junior take the fall.",
      explainWrong: "",
      teaches: "attribution",
      hint: "Search for the rule-disable action and read which workstation it came from.",
    },
  ],
  closingRight: [
    "Mags reads your note twice and does not drink her coffee.",
    "So the alerts were switched off, from inside, and we hung it on a kid on night shift. I have been angry before. This is new.",
  ],
  setFlags: ["knows_truth", "knows_harborwatch", "soc_clinic_case"],
};


// ---------- Network: where the clinic's data went ----------

const TEAM_NETWORK: Ticket = {
  id: "t3_network_flows",
  chapter: 3,
  dept: "network",
  severity: "high",
  client: "St. Brennan's Clinic",
  title: "Where the clinic's data went",
  xp: 100,
  requires: ["track_network", "clinic_examined"],
  attack: [
    { id: "T1048", name: "Exfiltration Over Alternative Protocol" },
    { id: "T1078", name: "Valid Accounts" },
  ],
  brief: [
    "Priya drops into the chair next to you and spins to face the screen.",
    "Imani found who got in. I want to know what left, and where it went. I pulled the clinic's old flow records for the week of the breach. Read them before you say a word.",
  ],
  evidence: [
    VANCE_MEMO,
    {
      kind: "flow",
      id: "ev_net_flows",
      label: "Clinic flow records, week of the breach",
      caption: "Traffic from the clinic file server to outside addresses.",
      rows: [
        { src: "clinic-fileserver", dst: "203.0.113.77", port: "443/tcp", bytes: "180 KB", note: "a handful of documents, read once" },
        { src: "clinic-fileserver", dst: "203.0.113.90", port: "443/tcp", bytes: "3.1 GB", note: "whole patient folders, copied out" },
        { src: "clinic-fileserver", dst: "198.51.100.10", port: "443/tcp", bytes: "60 MB", note: "nightly cloud backup, expected" },
      ],
    },
  ],
  questions: [
    {
      type: "spot",
      id: "q_net_spot",
      prompt: "Click the flow that carried the real theft: whole patient records, copied out of the clinic.",
      evidence: "ev_net_flows",
      answer: ["r1"],
      explainRight: "Right. 3.1 GB of patient folders to 203.0.113.90. The nightly backup is expected, and the 180 KB read is something else again.",
      explainWrong: "It is the 3.1 GB to 203.0.113.90. The 60 MB is the expected nightly backup, and the 180 KB is far too small to be the records.",
      teaches: "segmentation",
      hint: "One flow is the expected backup. Of the other two, which is big enough to be the patient records?",
    },
    {
      type: "single",
      id: "q_net_two",
      prompt: "Two different outside addresses touched the clinic's data. What does that tell you?",
      options: [
        "It is one attacker using two addresses to look busy",
        "The clinic's backup ran twice by mistake that week",
        "Two different parties were in the clinic's data, not one",
        "Nothing, since both addresses are in the same country",
      ],
      answer: 2,
      explainRight: "Right. One address read a few files and left. The other copied everything. Those are two different intentions, and almost certainly two different hands.",
      explainWrong: "The two addresses behave nothing alike: one reads a few files, the other hauls out everything. That points to two different parties, not one attacker being clever.",
      teaches: "attribution",
      hint: "Compare how much each address took, and how carefully. Do they look like the same person?",
    },
    {
      type: "typed",
      id: "q_net_secret",
      secret: "secret_network",
      prompt: "One of those two addresses only ever read a few small files, never the archives. Which address was the careful one?",
      answer: ["203.0.113.77"],
      placeholder: "An address",
      explainRight: "There it is. 203.0.113.77 only read a few files, proof, not loot. The crew at 203.0.113.90 took everything. The person collecting evidence and the crew collecting ransom were never the same.",
      explainWrong: "",
      teaches: "attribution",
      hint: "Read the note on each flow. One address took only a handful of documents.",
    },
  ],
  closingRight: [
    "Priya sits back and lets out a breath.",
    "Two sets of footprints. Whoever has been walking through our clients quietly is not the same crew that is tearing the place open. That matters more than it sounds like right now.",
  ],
  setFlags: ["knows_truth", "knows_harborwatch", "network_clinic_case"],
};


// ---------- Help Desk: the accounts that should not exist ----------

const TEAM_HELPDESK: Ticket = {
  id: "t3_helpdesk_accounts",
  chapter: 3,
  dept: "helpdesk",
  severity: "high",
  client: "St. Brennan's Clinic",
  title: "The account nobody opened",
  xp: 100,
  requires: ["track_helpdesk", "clinic_examined"],
  attack: [
    { id: "T1136", name: "Create Account" },
    { id: "T1078", name: "Valid Accounts" },
  ],
  brief: [
    "Theo slides his chair over, phone wedged between ear and shoulder, then hangs up.",
    "Clinic staff are frightened and the phones have not stopped. Imani found a service account that should not be there. Lock it down in the admin center without touching the real staff, and keep it as evidence, do not delete it. Then look at the old tickets.",
  ],
  evidence: [
    VANCE_MEMO,
    {
      kind: "console",
      id: "ev_hd_admin",
      label: "Clinic admin center",
      tenant: "St. Brennan's Clinic",
      intruder: { upn: "svc_tidewatch@stbrennans.example", ip: "203.0.113.77" },
      users: [
        {
          upn: "svc_tidewatch@stbrennans.example",
          name: "svc_tidewatch",
          role: "Service account (unexpected)",
          mfa: "off",
          sessions: [{ id: "s1", device: "Headless, API", ip: "203.0.113.77", place: "Unknown (hosting provider)", since: "recent" }],
          rules: [],
        },
        {
          upn: "a.reyes@stbrennans.example",
          name: "Dr. Ana Reyes",
          role: "Doctor",
          mfa: "number",
          sessions: [{ id: "s1", device: "Laptop, browser", ip: "10.60.1.20", place: "Clinic", since: "08:10" }],
          rules: [],
        },
        {
          upn: "reception@stbrennans.example",
          name: "Front Desk",
          role: "Reception",
          mfa: "number",
          sessions: [{ id: "s1", device: "Desktop", ip: "10.60.1.8", place: "Clinic", since: "07:55" }],
          rules: [],
        },
      ],
    },
    {
      kind: "note",
      id: "ev_hd_tickets",
      label: "Old ticket archive",
      title: "Clinic tickets, five years ago",
      lines: [
        "Ticket 4471: 'printer offline in records room'. Closed, fixed.",
        "Ticket 4488: 'HarborWatch alerts are not reaching my console'. Filed by n.sorel, two days before the breach. Closed by w.abernathy: won't fix.",
        "Ticket 4502: 'new starter needs a mailbox'. Closed, done.",
      ],
    },
  ],
  questions: [
    {
      type: "console",
      id: "q_hd_lock",
      prompt: "Lock down svc_tidewatch without touching the real staff. Block it, end its session, and keep it as evidence.",
      evidence: "ev_hd_admin",
      goals: [
        { kind: "blocked", upn: "svc_tidewatch@stbrennans.example", label: "Sign-in is blocked for svc_tidewatch." },
        { kind: "no-sessions", upn: "svc_tidewatch@stbrennans.example", label: "Its open session is signed out." },
        { kind: "none-deleted", upn: "svc_tidewatch@stbrennans.example", label: "Nothing is deleted, so it stays as evidence." },
        { kind: "untouched", upn: "a.reyes@stbrennans.example", label: "Dr. Reyes's account is left exactly as it was." },
        { kind: "untouched", upn: "reception@stbrennans.example", label: "Reception's account is left exactly as it was." },
      ],
      solution: [
        { type: "block", upn: "svc_tidewatch@stbrennans.example", on: true },
        { type: "revoke", upn: "svc_tidewatch@stbrennans.example" },
      ],
      explainRight: "Right. Blocked and signed out, so it cannot be used, but still there for forensics. You left the doctor and reception alone, which is the hard part when everyone wants you to do something.",
      explainWrong: "Block svc_tidewatch and end its session, but do not delete it, forensics needs it. And do not touch the real staff accounts: they are not the problem.",
      teaches: "least-privilege",
      hint: "Block it and revoke its session. Deleting it would throw away evidence, and the staff accounts are not yours to change here.",
    },
    {
      type: "typed",
      id: "q_hd_secret",
      secret: "secret_helpdesk",
      prompt: "Read the old tickets. Who filed the ticket saying the HarborWatch alerts were not reaching their console, two days before the breach?",
      answer: ["n.sorel", "nadia sorel", "nadia", "sorel"],
      placeholder: "A name",
      explainRight: "There it is. n.sorel filed it two days before the breach: the alerts were not reaching her console. Walter closed it as won't fix. She reported the exact hole she was later blamed for missing.",
      explainWrong: "",
      teaches: "attribution",
      hint: "Read each ticket's filer and its note. One was filed two days before the breach and closed won't fix.",
    },
  ],
  closingRight: [
    "Theo looks at the old ticket for a long moment.",
    "She told us. Two days before. In writing. And we closed it won't fix and then blamed her for it. I need a minute.",
  ],
  setFlags: ["knows_truth", "knows_harborwatch", "helpdesk_clinic_case"],
};


// ---------- Pentest: how they got in ----------

const TEAM_PENTEST: Ticket = {
  id: "t3_pentest_lab",
  chapter: 3,
  dept: "pentest",
  severity: "high",
  client: "St. Brennan's Clinic",
  title: "How did they get in?",
  xp: 100,
  requires: ["track_pentest", "clinic_examined"],
  attack: [
    { id: "T1133", name: "External Remote Services" },
    { id: "T1078", name: "Valid Accounts" },
  ],
  brief: [
    "Rook clears a space on the bench and sets down a laptop running a copy of the old HarborWatch.",
    "We know what was taken. I want to know how the door opens, exactly, so the fix is provable. I rebuilt the old login in the lab. Test it the way an attacker would, and keep notes.",
  ],
  evidence: [
    VANCE_MEMO,
    {
      kind: "note",
      id: "ev_pt_lab",
      label: "Lab test notes",
      title: "Old HarborWatch login, rebuilt",
      lines: [
        "The login page is reachable from the internet, no VPN in front of it.",
        "There is no account lockout: you can try the password as many times as you like.",
        "The one shared admin login, hw-admin, still works with the five-year-old password.",
        "There is no second factor. The password alone is the whole door.",
      ],
    },
    {
      kind: "note",
      id: "ev_pt_wiki",
      label: "Staff wiki access check",
      title: "Where the shared password lived",
      lines: [
        "The HarborWatch admin runbook is a page on Lanternhouse's own staff wiki.",
        "Step 3 of the runbook prints the shared password in plain text: Harbor!Watch2021",
        "The page is readable by the 'all staff' group.",
        "The 'all staff' group still contains intern-01, an account that was never removed.",
      ],
    },
    {
      kind: "request",
      id: "ev_pt3_req",
      label: "Request editor: the lab copy of the old login",
      request: ["POST /login HTTP/1.1", "Host: harborwatch-lab.test", "Content-Type: application/x-www-form-urlencoded", "", "user=hw-admin&pass=guess1"].join("\n"),
      app: {
        kind: "login",
        host: "harborwatch-lab.test",
        route: "/login",
        user: "hw-admin",
        password: "Harbor!Watch2021",
        role: "full admin, every client",
      },
    },
    {
      kind: "note",
      id: "ev_pt3_facts",
      label: "Finding notes",
      title: "What you know about the HarborWatch login",
      lines: [
        "Reached over the internet with an ordinary browser. No VPN stands in front of it.",
        "Nothing special has to line up: guesses are free, and the password has not changed in five years.",
        "An attacker needs no account of their own to begin.",
        "Nobody at the clinic has to click or approve anything.",
        "A HarborWatch admin controls the clinic's servers, which are separate systems from HarborWatch itself.",
        "From there, every patient record can be read, changed, or locked away.",
      ],
    },
  ],
  questions: [
    {
      type: "spot",
      id: "q_pt3_spot",
      prompt: "Click the line that shows the shared password was not really a secret at all.",
      evidence: "ev_pt_wiki",
      answer: ["l3"],
      explainRight: "Right. The runbook page was readable by everyone, including an old intern account nobody removed. 'Only an insider could know it' stops being an argument when half the building could read it.",
      explainWrong: "It is the line about the 'all staff' group still holding intern-01. If a forgotten account could read the page, the password was never really secret.",
      teaches: "least-privilege",
      hint: "The password being printed is bad. Worse is the line about who could read the page.",
    },
    {
      type: "request",
      id: "q_pt3_login",
      prompt: "Now show it on the lab copy, the way an attacker would. Prove the login never locks by sending at least three wrong guesses, then sign in with the password from the wiki.",
      evidence: "ev_pt3_req",
      explainRight: "Right. Wrong guess after wrong guess, and the reply still says account_locked is false. Then the five-year-old password from the wiki signs you in as full admin, with no second factor asked. Nothing about that needed skill.",
      explainWrong: "Not proved yet. Change pass= to anything wrong and send it at least three times: the reply counts your failures and never locks. Then set pass= to the password printed on the wiki page and send again. A 200 after free guesses is the finding.",
      teaches: "default-credentials",
      hint: "The request body is the last line. Send a few wrong passwords first and read what the reply says about locking. The real password is on the wiki page.",
    },
    {
      type: "single",
      id: "q_pt3_how",
      prompt: "Based on the lab test, how does someone get into the clinic through HarborWatch?",
      options: [
        "A brand new flaw in the login that nobody could have patched",
        "The shared password, over the internet, no lockout, no second factor",
        "By tricking a clinic nurse into installing something",
        "By being physically inside the clinic building",
      ],
      answer: 1,
      explainRight: "Right. An internet-facing login, one shared password that never changed, no lockout, no second factor. Not a clever new attack. An unlocked door that was unlocked for years.",
      explainWrong: "The lab shows an internet-facing login with one shared password, no lockout and no second factor. It is not a new flaw, it is a door left unlocked.",
      teaches: "mfa",
      hint: "Read the lab notes in order. How many things actually stand between the internet and admin access?",
    },
    {
      type: "cvss",
      id: "q_pt3_cvss",
      prompt: "Rate the HarborWatch login with CVSS v3.1 for the report. Use the finding notes.",
      vector: "AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
      why: {
        AV: "Anyone on the internet can reach the login page.",
        AC: "Nothing special has to line up: guesses are free and the password never changed.",
        PR: "The attacker starts with no account at all.",
        UI: "Nobody at the clinic has to do anything.",
        S: "The flaw is in HarborWatch, but the damage lands on the clinic's own servers.",
        C: "Every patient record can be read.",
        I: "Records can be changed.",
        A: "Records can be locked away from the clinic.",
      },
      explainRight: "Right: 10.0, Critical. Reachable by anyone, nothing to line up, no account needed, nobody to trick, and the damage spills past HarborWatch onto the clinic's own systems. Scores like this are rare. This one sat open for five years.",
      explainWrong: "It rates AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H, 10.0 Critical. Scope is Changed because the flaw is in HarborWatch but the harm is to the clinic's servers, and all three impacts are High because records can be read, altered and locked.",
      teaches: "cvss",
      hint: "Take the finding notes one line at a time. Each line answers one or two of the calculator's questions.",
    },
    {
      type: "typed",
      id: "q_pt3_secret",
      secret: "secret_pentest",
      prompt: "The shared password sat on the staff wiki for years. Which long-forgotten account could still read that page?",
      answer: ["intern-01", "intern", "the intern account", "intern01"],
      placeholder: "An account",
      explainRight: "There it is. intern-01, an account nobody ever removed, could read the password the whole time. Anyone who ever interned here could have had it. 'It had to be an insider' was never much of a case.",
      explainWrong: "",
      teaches: "least-privilege",
      hint: "Read the wiki access check. Which named account is still in the group that can read the page?",
    },
  ],
  closingRight: [
    "Rook files the lab notes, stapled, of course.",
    "So the door was unlocked, the key was on a wiki anyone could read, and we told the world only an insider could have done it. The fix is easy. Living with how long it was open is not.",
  ],
  setFlags: ["knows_truth", "knows_harborwatch", "pentest_clinic_case"],
};

// ---------- Threat Intel: who used that address before ----------

const TEAM_INTEL: Ticket = {
  id: "t3_intel_history",
  chapter: 3,
  dept: "intel",
  severity: "high",
  client: "St. Brennan's Clinic",
  title: "Who used that address before",
  xp: 100,
  requires: ["track_intel", "clinic_examined"],
  attack: [
    { id: "T1583.001", name: "Acquire Infrastructure: Domains" },
    { id: "T1078", name: "Valid Accounts" },
  ],
  brief: [
    "Juno has three string ends pinned and a space between them she keeps staring at.",
    "Imani gave me the backdoor address. I want its history: who used it before, and what else sits near it. Pivot it on the passive DNS board and tell me what connects.",
  ],
  evidence: [
    VANCE_MEMO,
    {
      kind: "pivot",
      id: "ev_intel_board",
      label: "Passive DNS board",
      caption: "Search a name or an address, and click any result to pivot. Mind the dates.",
      start: "203.0.113.77",
      db: {
        records: [
          { domain: "mailbox-portal.test", ip: "203.0.113.77", firstSeen: "this year", lastSeen: "this year", note: "the phishing and forwarding domain, Brightloaf and the school" },
          { domain: "tollgate.test", ip: "203.0.113.90", firstSeen: "this year", lastSeen: "this year", note: "the Tollkeepers' leak site" },
          { domain: "harbor-notice.example", ip: "203.0.113.80", firstSeen: "a week before the first case", lastSeen: "a week before the first case", note: "one email sent to Lanternhouse's shared inbox, never opened" },
        ],
      },
    },
    {
      kind: "note",
      id: "ev_intel_inbox",
      label: "Lanternhouse shared inbox",
      title: "One unread message",
      lines: [
        "From: contact@harbor-notice.example",
        "Subject: your HarborWatch password was never changed",
        "Status: unread. It arrived a week before the first case and nobody opened it.",
      ],
    },
  ],
  questions: [
    {
      type: "typed",
      id: "q_int3_pivot",
      prompt: "Pivot the clinic backdoor address, 203.0.113.77, to the domain that has used it.",
      answer: ["mailbox-portal.test", "mailbox-portal"],
      placeholder: "A domain",
      explainRight: "Right. 203.0.113.77 is the same address behind mailbox-portal.test, the phishing and forwarding domain from Brightloaf and the school. The clinic backdoor and the mailbox thefts share infrastructure.",
      explainWrong: "It is mailbox-portal.test. Look up 203.0.113.77 on the board and read the name on it. You have met that domain before.",
      teaches: "pivoting",
      hint: "Look the address up on the board and read the domain that sits on it.",
      solution: { evidence: "ev_intel_board", command: "203.0.113.77" },
    },
    {
      type: "typed",
      id: "q_int3_secret",
      secret: "secret_intel",
      prompt: "One name on the board appeared a week before anything else and was used to send a single email. Name that domain.",
      answer: ["harbor-notice.example", "harbor-notice"],
      placeholder: "A domain",
      explainRight: "There it is. harbor-notice.example, registered a week before the first case, used once to email Lanternhouse that the HarborWatch password was never changed. It sits unread in the shared inbox. She tried the front door first. Nobody answered.",
      explainWrong: "",
      teaches: "pivoting",
      hint: "Read the dates on each record. One domain appeared before all the others. Check the shared inbox for what it sent.",
    },
  ],
  closingRight: [
    "Juno pins harbor-notice.example to the board and steps back.",
    "A week before any of it, someone registered a domain just to warn us, and we never opened the email. Whoever is doing this tried asking first. I cannot stop thinking about that.",
  ],
  setFlags: ["knows_truth", "knows_harborwatch", "intel_clinic_case"],
};

export const TEAM_TICKETS: Ticket[] = [TEAM_SOC, TEAM_NETWORK, TEAM_HELPDESK, TEAM_PENTEST, TEAM_INTEL];
