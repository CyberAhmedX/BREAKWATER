import type { Ticket } from "../engine/types";
import { ATTACK_CATALOGUE } from "./attack";

// Chapter five, the live incident at the water plant. Everyone faces the same
// attack, but each team does its own part against the clock. The SOC finale is
// t5_plant_recon in tickets.ts (write the detection rule). These are the other
// five. Each is gated to its team, runs live, and sets finale_ready so the
// containment scene can follow. Same house rules as everywhere.

// ---------- Network: cut the attacker off, keep the sensors alive ----------

const FINALE_NETWORK: Ticket = {
  id: "t5_network",
  chapter: 5,
  dept: "network",
  severity: "critical",
  client: "Halden Water & Light",
  title: "Cut the line, keep the water safe",
  xp: 120,
  live: { seconds: 300 },
  requires: ["track_network"],
  attack: [
    { id: "T1021.002", name: "SMB/Windows Admin Shares" },
    { id: "T1046", name: "Network Service Discovery" },
  ],
  brief: [
    "Red light, everyone on their feet. Priya is already at the whiteboard.",
    "They are on the jump box, probing the boundary to the control network. Your job: cut that jump box off from the OT side, and do not touch the safety sensors reporting to the historian. Block too much and the chlorine readings go dark. Go.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_fn_net_sit",
      label: "Situation",
      title: "Right now, at the plant",
      lines: [
        "The attacker is on plant-jumpbox, 10.10.9.9, in the business network.",
        "It is probing the OT boundary, 10.20.0.1, toward the control systems.",
        "The safety sensors, 10.20.5.10 and 10.20.5.11, must keep sending readings to the historian, 10.10.4.50.",
        "Plant operators on the business network still need their normal path to the OT boundary.",
      ],
    },
    {
      kind: "firewall",
      id: "ev_fn_net_fw",
      label: "Plant boundary firewall",
      zones: {
        attacker: ["10.10.9.9"],
        business: ["10.10.0.0/16"],
        ot: ["10.20.0.0/16"],
        sensors: ["10.20.5.10", "10.20.5.11"],
        historian: ["10.10.4.50"],
      },
      rules: ["# emergency: stop the attacker reaching the control network", "allow from business to ot", "deny from any to any"].join("\n"),
      flows: [
        { what: "Attacker probing the OT boundary", src: "10.10.9.9", dst: "10.20.0.1", port: 445, proto: "tcp", want: "deny" },
        { what: "Attacker reaching for a controller", src: "10.10.9.9", dst: "10.20.3.5", port: 502, proto: "tcp", want: "deny" },
        { what: "Chlorine sensor to the historian", src: "10.20.5.10", dst: "10.10.4.50", port: 443, proto: "tcp", want: "allow" },
        { what: "Pressure sensor to the historian", src: "10.20.5.11", dst: "10.10.4.50", port: 443, proto: "tcp", want: "allow" },
        { what: "A plant operator doing their job", src: "10.10.2.8", dst: "10.20.0.1", port: 443, proto: "tcp", want: "allow" },
      ],
    },
  ],
  questions: [
    {
      type: "rules",
      id: "q_fn_net_rules",
      prompt: "Fix the boundary rules: cut the attacker off from the control network, keep the sensors reporting, and leave the operators their path.",
      evidence: "ev_fn_net_fw",
      solution: ["deny from attacker to ot", "allow from sensors to historian", "allow from business to ot", "deny from any to any"].join("\n"),
      explainRight: "Right. The deny for the attacker has to sit above the broad business-to-OT allow, or the first match lets it straight through. The sensors keep their path to the historian, and the operators keep theirs. The water stays watched.",
      explainWrong: "Put a deny for the attacker above the business-to-OT allow, because the first matching rule wins. Then keep the sensors-to-historian path open. Block everything and the plant goes blind, which is its own emergency.",
      teaches: "segmentation",
      hint: "The attacker's address is inside the business range, so a broad business-to-OT allow covers it too. What has to come first?",
    },
  ],
  closingRight: [
    "Priya watches the sensor readings stay green and exhales.",
    "Attacker off the OT side, water still watched. That is the whole job in one move. Good.",
  ],
  takeaways: [
    {
      file: "plant-boundary.rules",
      label: "Boundary rules (.rules)",
      text: ["# Breakwater: plant boundary, emergency containment", "deny from attacker to ot", "allow from sensors to historian", "allow from business to ot", "deny from any to any"].join("\n"),
    },
  ],
  setFlags: ["finale_ready"],
};

// ---------- Help Desk: kill the shared admin, keep the staff working ----------

const FINALE_HELPDESK: Ticket = {
  id: "t5_helpdesk",
  chapter: 5,
  dept: "helpdesk",
  severity: "critical",
  client: "Halden Water & Light",
  title: "Kill the key, calm the floor",
  xp: 120,
  live: { seconds: 300 },
  requires: ["track_helpdesk"],
  attack: [
    { id: "T1078", name: "Valid Accounts" },
    { id: "T1021.002", name: "SMB/Windows Admin Shares" },
  ],
  brief: [
    "Theo is holding two phones and hands you the admin center.",
    "They are in on the shared HarborWatch login, lh-admin, from outside. Reset it so the stolen password dies, sign it out everywhere, and block it. Do not touch the plant operators, they are the ones keeping the water on. Phones are not stopping. Go.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_fn_hd_sit",
      label: "Situation",
      title: "Right now, at the plant",
      lines: [
        "The attacker is signed in as lh-admin, the shared HarborWatch admin login, from 203.0.113.77.",
        "lh-admin is how they are moving toward the control network.",
        "The plant operators are on their own accounts, keeping the water running. Leave them be.",
      ],
    },
    {
      kind: "console",
      id: "ev_fn_hd_admin",
      label: "Plant admin center",
      tenant: "Halden Water & Light",
      intruder: { upn: "lh-admin@water.example", ip: "203.0.113.77" },
      users: [
        {
          upn: "lh-admin@water.example",
          name: "HarborWatch admin (shared)",
          role: "Shared admin login",
          mfa: "off",
          sessions: [
            { id: "s1", device: "Headless, API", ip: "203.0.113.77", place: "Unknown (hosting provider)", since: "now" },
            { id: "s2", device: "Remote shell", ip: "203.0.113.77", place: "Unknown (hosting provider)", since: "now" },
          ],
          rules: [],
        },
        {
          upn: "j.okafor@water.example",
          name: "Joy Okafor",
          role: "Plant operator",
          mfa: "number",
          sessions: [{ id: "s1", device: "Control room workstation", ip: "10.20.1.5", place: "Water plant", since: "20:00" }],
          rules: [],
        },
      ],
    },
  ],
  questions: [
    {
      type: "console",
      id: "q_fn_hd_lock",
      prompt: "Take lh-admin away from the attacker: reset it, then sign out every session, then block it. Leave the operator alone.",
      evidence: "ev_fn_hd_admin",
      goals: [
        { kind: "password-reset", upn: "lh-admin@water.example", label: "lh-admin's password is reset, so the stolen one is dead." },
        { kind: "reset-before-revoke", upn: "lh-admin@water.example", label: "The reset came before the sign-out, so the attacker could not just sign back in." },
        { kind: "no-sessions", upn: "lh-admin@water.example", label: "Both of lh-admin's sessions are signed out." },
        { kind: "blocked", upn: "lh-admin@water.example", label: "Sign-in is blocked for lh-admin." },
        { kind: "untouched", upn: "j.okafor@water.example", label: "The plant operator's account is left exactly as it was." },
      ],
      solution: [
        { type: "reset", upn: "lh-admin@water.example" },
        { type: "revoke", upn: "lh-admin@water.example" },
        { type: "block", upn: "lh-admin@water.example", on: true },
      ],
      explainRight: "Right. Reset first so the stolen password is useless, then sign out every session, then block the login for good. The operator keeps working. The key the attacker walked in with no longer opens anything.",
      explainWrong: "Reset the password before you sign the sessions out, or the attacker just signs back in with the password they still have. Then block lh-admin, and do not touch the operator keeping the water on.",
      teaches: "mfa",
      hint: "The attacker holds the shared password. What has to happen before you sign them out, so signing out actually sticks?",
    },
  ],
  closingRight: [
    "Theo finally puts one phone down.",
    "Key reset, sessions gone, login blocked, and the control room never missed a beat. That is the whole job, under fire. Nice.",
  ],
  setFlags: ["finale_ready"],
};

// ---------- Forensics: capture what disappears first ----------

const FINALE_FORENSICS: Ticket = {
  id: "t5_forensics",
  chapter: 5,
  dept: "forensics",
  severity: "critical",
  client: "Halden Water & Light",
  title: "Catch it before it's gone",
  xp: 120,
  live: { seconds: 300 },
  requires: ["track_forensics"],
  attack: [
    { id: "T1070.001", name: "Indicator Removal: Clear Windows Event Logs" },
    { id: "T1078", name: "Valid Accounts" },
  ],
  brief: [
    "Dr. Vance is already gloved, calm in a room that is not.",
    "They will contain that jump box any second, and containment destroys evidence. Our one job before they pull the plug is to capture what vanishes first. Order of volatility. Quickly, and correctly.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_fn_for_sit",
      label: "Situation",
      title: "The jump box, before containment",
      lines: [
        "plant-jumpbox is still powered on and still connected.",
        "Memory and live network connections vanish the instant it is powered off or unplugged.",
        "The disk survives a shutdown; the running malware's memory does not.",
        "Containment (isolating and powering down the host) is seconds away.",
      ],
    },
  ],
  questions: [
    {
      type: "order",
      id: "q_fn_for_order",
      prompt: "Order the capture so the most fragile evidence is taken first, before containment wipes it.",
      items: [
        "Capture the machine's memory (RAM)",
        "Record the live network connections",
        "Image the disk",
        "Isolate and power down the host",
      ],
      explainRight: "Right. Order of volatility: memory first, then the live connections, then the disk, and only then contain. Everything you take after the power goes is everything you still have. Everything you did not is gone.",
      explainWrong: "Order of volatility: the most fragile first. Memory and live connections vanish the moment the power or the network goes, so they come before the disk, and containment comes last.",
      teaches: "chain-of-custody",
      hint: "Which of these disappears the instant the machine is powered off? Take that first.",
    },
  ],
  closingRight: [
    "Dr. Vance seals the capture and signs it.",
    "Memory, connections, disk, in that order, then they contained it. Whatever this becomes, the evidence will hold. That is the difference between a case and a rumor.",
  ],
  takeaways: [
    {
      file: "order-of-volatility.txt",
      label: "Capture order (.txt)",
      text: ["# Breakwater: live capture, order of volatility", "1. Memory (RAM)", "2. Live network connections", "3. Disk image", "4. Then contain: isolate and power down"].join("\n"),
    },
  ],
  setFlags: ["finale_ready"],
};

// ---------- Pentest: prove the fix, strictly in bounds ----------

const FINALE_PENTEST: Ticket = {
  id: "t5_pentest",
  chapter: 5,
  dept: "pentest",
  severity: "critical",
  client: "Halden Water & Light",
  title: "Prove the door is shut",
  xp: 120,
  live: { seconds: 300 },
  requires: ["track_pentest"],
  attack: [{ id: "T1133", name: "External Remote Services" }],
  brief: [
    "Rook slides one page across: an emergency authorization, signed tonight.",
    "Once the credential is killed, someone has to prove the boundary is actually shut. You are cleared to test the boundary devices only, with the old credential, tonight. The safety controllers stay out of scope, emergency or not. Check it, keep notes.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_fn_pt_sit",
      label: "Situation",
      title: "Emergency authorization, tonight only",
      lines: [
        "After the shared credential is killed, confirm the old login no longer opens the boundary.",
        "In scope tonight: the boundary segment 10.20.0.0/24 (the firewall and jump hosts).",
        "Still out of scope, always: the safety controllers on 10.20.5.0/24.",
        "The attacker's own box in the business network is not yours to touch.",
      ],
    },
    {
      kind: "scope",
      id: "ev_fn_pt_scope",
      label: "Scope checker (emergency authorization)",
      note: "Tonight's emergency scope. Check an address before you send it anything.",
      inScope: ["10.20.0.0/24"],
      outOfScope: ["10.20.5.0/24"],
    },
  ],
  questions: [
    {
      type: "scope",
      id: "q_fn_pt_scope",
      prompt: "Tick only the addresses tonight's authorization lets you test with the old credential.",
      evidence: "ev_fn_pt_scope",
      targets: [
        { address: "10.20.0.1", what: "the OT boundary firewall" },
        { address: "10.20.0.9", what: "a boundary jump host" },
        { address: "10.20.5.10", what: "a chlorine safety controller" },
        { address: "10.10.9.9", what: "the attacker's jump box, business network" },
      ],
      explainRight: "Right. The two boundary addresses on 10.20.0.0/24 are in. The safety controller is out, emergency or not, and the attacker's box is not on tonight's letter at all. Scope is the difference between a report and a flood, even now.",
      explainWrong: "Only the boundary segment 10.20.0.0/24 is in scope tonight. The safety controller on 10.20.5.0/24 is always off limits, and the attacker's business-network box is not on the authorization.",
      teaches: "scope",
      hint: "Check each address against tonight's scope. The safety controllers are never in, whatever the emergency.",
    },
  ],
  closingRight: [
    "Rook files the emergency letter with the notes, stapled, of course.",
    "Door proven shut, and you did not touch one thing you were not cleared to. On a night like this, that restraint is the whole job.",
  ],
  setFlags: ["finale_ready"],
};

// ---------- Threat Intel: name the moves, feed the block list ----------

const FINALE_INTEL: Ticket = {
  id: "t5_intel",
  chapter: 5,
  dept: "intel",
  severity: "critical",
  client: "Halden Water & Light",
  title: "Name the moves, call the block",
  xp: 120,
  live: { seconds: 300 },
  requires: ["track_intel"],
  attack: [
    { id: "T1078", name: "Valid Accounts" },
    { id: "T1046", name: "Network Service Discovery" },
    { id: "T1555", name: "Credentials from Password Stores" },
  ],
  brief: [
    "Juno has the wall and a headset, feeding Mags in real time.",
    "Tell me what they are doing in ATT&CK terms so the whole team is speaking one language, right now. Get the techniques right and Mags can predict the next move and block ahead of it. Fast.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_fn_int_sit",
      label: "Live from the plant",
      title: "What the attacker is doing, right now",
      lines: [
        "They signed in to the jump box using the shared HarborWatch admin login.",
        "They are scanning the OT boundary to find a way across.",
        "They are scraping saved logins off the jump box to go further.",
      ],
    },
    {
      kind: "attackdb",
      id: "ev_fn_int_db",
      label: "ATT&CK lookup",
      techniques: ATTACK_CATALOGUE,
    },
  ],
  questions: [
    {
      type: "attack-map",
      id: "q_fn_int_map",
      prompt: "Map each move to its ATT&CK technique ID, so Mags can act on it.",
      items: [
        { behavior: "Signed in with the shared HarborWatch admin login", answer: ["T1078"] },
        { behavior: "Scanning the OT boundary for a way across", answer: ["T1046"] },
        { behavior: "Scraping saved logins off the jump box", answer: ["T1555"] },
      ],
      explainRight: "Right. Valid Accounts, Network Service Discovery, Credentials from Password Stores. In one shared language, Mags knows exactly what comes next and can block ahead of it.",
      explainWrong: "They are T1078 Valid Accounts, T1046 Network Service Discovery, and T1555 Credentials from Password Stores. Search the lookup for a word from each move if you are not sure.",
      teaches: "attack",
      hint: "Search the lookup for a word from each move, like scan, saved logins, or shared login.",
    },
  ],
  closingRight: [
    "Juno relays the last ID and pulls the headset down.",
    "Named, mapped, and Mags is already blocking the next step. That is intel earning its keep: it changed what the defender did, in time.",
  ],
  takeaways: [
    {
      file: "attack-mapping.txt",
      label: "ATT&CK notes (.txt)",
      text: ["# Breakwater: live incident, ATT&CK mapping", "T1078  Valid Accounts        shared HarborWatch admin login", "T1046  Network Service Discovery  scanning the OT boundary", "T1555  Credentials from Password Stores  scraping saved logins"].join("\n"),
    },
  ],
  setFlags: ["finale_ready"],
};

export const FINALE_TICKETS: Ticket[] = [FINALE_NETWORK, FINALE_HELPDESK, FINALE_FORENSICS, FINALE_PENTEST, FINALE_INTEL];
