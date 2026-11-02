import type { Ticket } from "../engine/types";
import { TRACK_TICKETS } from "./tracks";
import { TEAM_TICKETS } from "./teamcases";
import { FINALE_TICKETS } from "./finales";
import { TEMPT_TICKETS } from "./teamcases4";
import { SIDE_TICKETS } from "./sides";
import { schoolDnsLog, type SchoolDns } from "./logs";
import { ATTACK_CATALOGUE } from "./attack";
import { F } from "../engine/endings";

// The static default for the school DNS case. A real run rebuilds it from the
// run's seed (see content/vary.ts); this keeps the catalogue and tests stable.
const DEFAULT_DNS_SEED = 20260314;
const SCHOOL_DNS = schoolDnsLog(DEFAULT_DNS_SEED);

// The school DNS tunnel case, built from one run of the resolver-log generator.
// Which lab PC is the tunnel, the domain it talks to and the lookup count all
// come from the run's seed. The solutions read the data, so they follow along.
export function schoolDnsTicket(dns: SchoolDns): Ticket {
  return {
    id: "t2_school_dns",
    chapter: 2,
    dept: "network",
    severity: "high",
    client: "Halden Unified School District",
    title: "A lab PC that will not stop talking",
    xp: 70,
    attack: [
      { id: "T1071.004", name: "Application Layer Protocol: DNS" },
      { id: "T1048", name: "Exfiltration Over Alternative Protocol" },
    ],
    brief: [
      "Priya rolls her chair into your aisle.",
      "The school's firewall is screaming about the computer lab. Far too many DNS lookups. I copied twenty minutes of their resolver log onto an analysis box for you. Find the machine, find where it is talking to, and tell me what you see. No pressure. It is DNS. It is always DNS.",
    ],
    evidence: [
      {
        kind: "terminal",
        id: "ev_dns_box",
        label: "Analysis box: school resolver log",
        files: { "dns.log": dns.log },
      },
      {
        kind: "flow",
        id: "ev_dns_flow",
        label: "Firewall flow summary for the lab, today",
        caption: "Traffic per destination from the lab's busiest machine.",
        rows: [
          { src: dns.tunnelHost, dst: "DNS resolver", port: "53/udp", bytes: "88 MB" },
          { src: dns.tunnelHost, dst: "school fileshare", port: "445/tcp", bytes: "2 MB" },
          { src: dns.tunnelHost, dst: "update server", port: "443/tcp", bytes: "40 MB" },
        ],
      },
    ],
    questions: [
      {
        type: "typed",
        id: "q_dns_host",
        prompt: "Which machine is making far more lookups than the rest of the lab?",
        answer: [dns.tunnelHost, dns.tunnelIp],
        placeholder: "Host name or address",
        explainRight: `Right. Every other lab PC makes under a hundred lookups in twenty minutes. ${dns.tunnelHost} makes several hundred.`,
        explainWrong: `It is ${dns.tunnelHost}. Count lookups per host and it stands far above every other machine in the lab.`,
        teaches: "dns-tunnel",
        hint: "Count lookups per host: cut out the host column, then sort | uniq -c | sort -rn.",
        solution: { evidence: "ev_dns_box", command: "cut -f2 dns.log | sort | uniq -c | sort -rn | head -3" },
      },
      {
        type: "typed",
        id: "q_dns_domain",
        prompt: "Which domain are most of its lookups going to?",
        answer: [dns.tunnelDomain, `data.${dns.tunnelDomain}`],
        placeholder: "Domain",
        explainRight: `Right. Hundreds of TXT lookups for random names under data.${dns.tunnelDomain}, and no name ever repeats. Each random name is a chunk of data leaving the school.`,
        explainWrong: `It is ${dns.tunnelDomain}. Strip the random first label off each name and nearly all of the machine's lookups land on data.${dns.tunnelDomain}.`,
        teaches: "dns-tunnel",
        hint: "Keep only that machine's lines with grep, then look at the query column. The first part of each name is random, so cut it off with cut -d. -f2-.",
        solution: { evidence: "ev_dns_box", command: `grep ${dns.tunnelHost} dns.log | cut -f4 | cut -d. -f2- | sort | uniq -c | sort -rn | head -3` },
      },
      {
        type: "typed",
        id: "q_dns_count",
        prompt: "How many lookups went to that domain in these twenty minutes?",
        answer: [String(dns.tunnelCount)],
        placeholder: "A number",
        explainRight: `Right, ${dns.tunnelCount}. About one every two to three seconds, for the whole sample, from one lab PC. Nobody browses like that.`,
        explainWrong: `It is ${dns.tunnelCount}. grep -c counts the lines that match, which is one line per lookup.`,
        teaches: "dns-tunnel",
        hint: "grep -c counts matching lines instead of printing them.",
        solution: { evidence: "ev_dns_box", command: `grep -c ${dns.tunnelDomain} dns.log` },
      },
      {
        type: "single",
        id: "q_dns_why_dns",
        prompt: "Why would an attacker choose DNS for this?",
        options: [
          "DNS traffic is encrypted, so the firewall cannot read it",
          "Firewalls nearly always let DNS out unchecked",
          "DNS is faster than HTTPS for moving large files",
          "DNS queries are never logged, so nothing is left behind",
        ],
        answer: 1,
        explainRight: "Exactly. Block DNS and the whole network breaks, so it is left open, which makes it a tempting smuggling route.",
        explainWrong: "DNS is left open on almost every network because things break without it. That near-universal allowance is exactly why it gets abused as a tunnel.",
        teaches: "dns-tunnel",
        hint: "Think about what stops working on a network that blocks DNS.",
      },
      {
        type: "order",
        id: "q_dns_steps",
        prompt: "Order your response.",
        items: [
          `Isolate ${dns.tunnelHost} from the network`,
          `Block the domain ${dns.tunnelDomain} at the resolver`,
          "Capture the machine for forensics before anyone wipes it",
          "Hunt for the same domain or pattern on other machines",
        ],
        explainRight: "Good. Contain the host, cut the channel, preserve it for forensics, then hunt for spread. Stop the bleeding, then investigate, then widen.",
        explainWrong: "Isolate the host, block the domain, preserve the machine for forensics, then hunt for the pattern elsewhere. Contain, cut, preserve, hunt.",
        teaches: "dns-tunnel",
        hint: "Stop the leak first. Save the machine before anyone cleans it. Look wider last.",
      },
    ],
    closingRight: [
      "Priya pumps a fist.",
      "DNS. I rest my case. Nice read, though, you did not just take my word for it, you checked the flow. That matters. The domain is blocked and the box is bagged for Imani.",
    ],
    setFlags: ["dns_case"],
  };
}

// The full source of the Brightloaf phishing email, as the mail server saved
// it. Received headers stack up newest first, so the hop Brightloaf's own
// server recorded is the one to trust; anything below it was written by the
// sender and can say anything.
const PHISH_SOURCE = [
  "Return-Path: <bounce@mailbox-portal.test>",
  "Received: from mx1.brightloaf.example (mx1.brightloaf.example [198.51.100.25])",
  "\tby mail.brightloaf.example with ESMTPS id 4F2A9C01",
  "\tfor <m.okonkwo@brightloaf.example>; Mon, 9 Mar 2026 08:14:09 +0000",
  "Received: from mail.mailbox-portal.test (mail.mailbox-portal.test [203.0.113.77])",
  "\tby mx1.brightloaf.example with ESMTP id 9B77E2",
  "\tfor <m.okonkwo@brightloaf.example>; Mon, 9 Mar 2026 08:14:07 +0000",
  "Received: from [10.8.0.6] (unknown [10.8.0.6])",
  "\tby mail.mailbox-portal.test with ESMTPSA id 31C0",
  "\tfor <m.okonkwo@brightloaf.example>; Mon, 9 Mar 2026 08:14:05 +0000",
  "Authentication-Results: mx1.brightloaf.example;",
  "\tspf=pass (mailbox-portal.test designates 203.0.113.77 as a permitted sender) smtp.mailfrom=mailbox-portal.test;",
  "\tdkim=none (message not signed);",
  "\tdmarc=fail (p=none) header.from=brightloaf-payroll.example",
  "From: Gregor Brightloaf <gregor.brightloaf@brightloaf-payroll.example>",
  "Reply-To: gregor.pay@mailbox-portal.test",
  "To: Office Manager <m.okonkwo@brightloaf.example>",
  "Subject: URGENT need this done before I board",
  "Date: Mon, 9 Mar 2026 08:14:02 +0000",
  "Message-ID: <a81f3c@mailbox-portal.test>",
].join("\n");

/** The spot key of the first line of raw text containing needle. */
function lineKey(text: string, needle: string): string {
  const n = text.split("\n").findIndex((l) => l.includes(needle));
  if (n < 0) throw new Error(`no line with ${needle}`);
  return `l${n}`;
}

// Investigation tickets. Every address is from a documentation range
// (192.0.2.x, 198.51.100.x, 203.0.113.x) or a private range, every domain uses
// the reserved .example / .test TLD, and URLs are defanged. Nothing here points
// at a real system. The scenarios are built to teach by doing.

const STORY_TICKETS: Ticket[] = [
  // ------------------------------------------------------------------ CH 1
  {
    id: "t1_bakery_phish",
    chapter: 1,
    dept: "helpdesk",
    severity: "medium",
    client: "Brightloaf Bakery Co.",
    title: "Weird email from the owner",
    xp: 40,
    attack: [
      { id: "T1566", name: "Phishing" },
      { id: "T1656", name: "Impersonation" },
    ],
    brief: [
      "Theo drops a sticky note on your monitor.",
      "First real one. Brightloaf's office manager forwarded this and asked if it is legit. Have a look, tell me what you see, and what she should do.",
    ],
    evidence: [
      {
        kind: "email",
        id: "ev_phish_mail",
        label: "Forwarded email",
        from: "Gregor Brightloaf <gregor.brightloaf@brightloaf-payroll.example>",
        to: "Office Manager <m.okonkwo@brightloaf.example>",
        date: "Mon 08:14",
        subject: "URGENT need this done before I board",
        headers: {
          "Reply-To": "gregor.pay@mailbox-portal.test",
          "Return-Path": "bounce@mailbox-portal.test",
        },
        body: [
          "Hi, I'm about to get on a flight and can't take calls.",
          "I need you to settle an urgent supplier invoice today. Reply here and I'll send the account details. Don't loop in finance, it's time sensitive and confidential.",
          "Sent from my phone",
        ],
      },
      {
        kind: "raw",
        id: "ev_phish_source",
        label: "Full message source",
        tag: "EMAIL SOURCE",
        caption: "Every header, as Brightloaf's mail server saved it. Received lines stack newest first.",
        text: PHISH_SOURCE,
      },
      {
        kind: "note",
        id: "ev_phish_realaddr",
        label: "Address book check",
        title: "Gregor's real address on file",
        lines: [
          "Directory entry: gregor@brightloaf.example",
          "The email claims to come from: gregor.brightloaf@brightloaf-payroll.example",
          "Reply-To points somewhere else again: gregor.pay@mailbox-portal.test",
        ],
      },
    ],
    questions: [
      {
        type: "spot",
        id: "q_phish_spot",
        prompt: "Click the line in the email that shows where a reply would really go.",
        evidence: "ev_phish_mail",
        answer: ["h:Reply-To"],
        explainRight: "Right. The Reply-To header sends any reply to mailbox-portal.test, not to Brightloaf. Whoever answers is talking to the attacker.",
        explainWrong: "Look at the Reply-To header. It sends every reply to mailbox-portal.test, a domain that has nothing to do with Brightloaf.",
        teaches: "phishing",
        hint: "A reply does not always go back to the From address. One header decides where it lands.",
      },
      {
        type: "typed",
        id: "q_phish_origin",
        prompt: "Read the Received headers. Which address actually handed this email to Brightloaf's mail server?",
        answer: ["203.0.113.77"],
        placeholder: "IP address",
        explainRight: "Right. Brightloaf's own server, mx1, recorded the connection from mail.mailbox-portal.test at 203.0.113.77. Lines below that one were written by the sender's side and could say anything; the 10.8.0.6 one is a private address that tells you nothing.",
        explainWrong: "It is 203.0.113.77. Received lines stack newest first. Trust the first one written by a server you control, mx1.brightloaf.example, and read who connected to it. Everything below was written by the sender.",
        teaches: "email-headers",
        hint: "Work down from the top until you reach the Received line written by a Brightloaf server that says who it received the mail from.",
      },
      {
        type: "spot",
        id: "q_phish_dmarc",
        prompt: "Click the line that shows the message failed the check for the domain in its From address.",
        evidence: "ev_phish_source",
        answer: [lineKey(PHISH_SOURCE, "dmarc=")],
        explainRight: "Right. SPF passed, but only for mailbox-portal.test, the bounce domain. DMARC checks the domain people actually see in From, and nothing about this message lines up with it. A pass on the wrong domain proves nothing.",
        explainWrong: "It is the dmarc=fail line. SPF did pass, but for mailbox-portal.test, not the From domain. DMARC is the check that ties authentication to the From address people see.",
        teaches: "email-headers",
        hint: "SPF can pass for a domain nobody sees. Find the result that is about header.from.",
      },
      {
        type: "multi",
        id: "q_phish_signs",
        prompt: "Select every warning sign in this email.",
        options: [
          "Urgency and pressure to act before a flight",
          "Sender domain does not match the real one on file",
          "Reply-To points to a third, unrelated address",
          "Asks to keep finance out of the loop",
          "It says 'Sent from my phone'",
        ],
        answer: [0, 1, 2, 3],
        explainRight: "Good eye. Manufactured urgency, a lookalike sender domain, a mismatched Reply-To, and an attempt to bypass normal process. 'Sent from my phone' is just a signature, harmless on its own.",
        explainWrong: "The red flags are the urgency, the mismatched sender domain, the odd Reply-To, and the request to skip finance. 'Sent from my phone' is just a signature and proves nothing either way.",
        teaches: "phishing",
        hint: "Not every odd detail is a warning sign. For each one, ask whether a real email from Gregor could look the same.",
      },
      {
        type: "single",
        id: "q_phish_action",
        prompt: "What should the office manager do?",
        options: [
          "Reply asking for the invoice so you can check it before paying",
          "Pay it now, then confirm with Gregor once he has landed",
          "Call Gregor on the number on file and report the email",
          "Forward it to the whole company as a warning first",
        ],
        answer: 2,
        explainRight: "Exactly. Verify through a channel you already trust, and report it. Never reply to the suspicious message itself.",
        explainWrong: "Verify with Gregor using a number you already have, and report the email. Replying only tells the sender a human is reading.",
        teaches: "phishing",
        hint: "Whatever she does, no phone number, address or link from the suspicious email should be part of it.",
      },
    ],
    closingRight: [
      "Theo reads your note and exhales.",
      "Textbook. She almost wired four thousand dollars to 'a supplier'. You just saved Brightloaf a very bad Monday. That is the job.",
    ],
    setFlags: ["seen_brightloaf"],
  },
  {
    id: "t1_printer",
    chapter: 1,
    dept: "helpdesk",
    severity: "low",
    client: "Halden Unified School District",
    title: "The library printer has a virus (allegedly)",
    xp: 20,
    side: true,
    brief: [
      "Theo is trying not to laugh.",
      "The school librarian is certain the printer is infected because it printed forty pages of symbols. Take it. Gently. She is lovely and she is also wrong.",
    ],
    evidence: [
      {
        kind: "note",
        id: "ev_printer_note",
        label: "Librarian's report",
        title: "What happened",
        lines: [
          "Printer spat out 40 pages of garbled characters starting with %!PS-Adobe-3.0",
          "Happened right after a student sent a document from an old laptop",
          "No other symptoms. Printer otherwise fine.",
        ],
      },
    ],
    questions: [
      {
        type: "single",
        id: "q_printer",
        prompt: "The pages begin with %!PS-Adobe. What actually happened?",
        options: [
          "Malware on the print server is printing its own code",
          "Wrong driver: it printed raw PostScript as plain text",
          "A student sent a script that took over the print queue",
          "The printer's firmware is corrupted and needs reflashing",
        ],
        answer: 1,
        explainRight: "Right. That header is PostScript. The printer printed the page description instead of rendering it, almost always a driver mismatch. Not a virus.",
        explainWrong: "That %!PS-Adobe header is PostScript, the language that describes the page. The printer printed it as text, a classic wrong-driver issue, not malware.",
        teaches: "false-positive",
        hint: "Look up what a file starting with %!PS is before you blame malware.",
      },
    ],
    closingRight: [
      "You fix the driver and print her a clean test page of library cats.",
      "Theo nods sagely. Most days are this. Then some days are not. Enjoy the ones that are.",
    ],
  },

  // ------------------------------------------------------------------ CH 2
  {
    id: "t2_bakery_bec",
    chapter: 2,
    dept: "soc",
    severity: "high",
    client: "Brightloaf Bakery Co.",
    title: "Invoices going missing in finance",
    xp: 70,
    attack: [
      { id: "T1078", name: "Valid Accounts" },
      { id: "T1114.003", name: "Email Forwarding Rule" },
      { id: "T1564.008", name: "Email Hiding Rules" },
    ],
    requires: ["seen_brightloaf"],
    brief: [
      "Mags waves you over without turning around.",
      "Brightloaf again. Finance says suppliers claim they sent invoices nobody received. Smells like someone is in a mailbox. Here is the account's activity. Read it before you decide anything.",
    ],
    evidence: [
      {
        kind: "log",
        id: "ev_bec_logins",
        label: "Sign-in log: finance@brightloaf.example",
        source: "Mail service audit log",
        columns: ["Time", "Source IP", "Location", "Result"],
        rows: [
          ["Tue 09:02", "198.51.100.23", "Port Halden", "Success"],
          ["Tue 09:40", "198.51.100.23", "Port Halden", "Success"],
          ["Wed 02:11", "203.0.113.77", "Unknown (VPS range)", "Success"],
          ["Wed 02:12", "203.0.113.77", "Unknown (VPS range)", "Rule created"],
          ["Wed 09:05", "198.51.100.23", "Port Halden", "Success"],
        ],
      },
      {
        kind: "note",
        id: "ev_bec_rule",
        label: "New mailbox rule",
        title: "Rule created Wed 02:12 from 203.0.113.77",
        lines: [
          "Name: '.' (a single dot, easy to miss in a list)",
          "If subject or body contains: invoice, payment, bank, remittance",
          "Then: forward to external address store-receipts@mailbox-portal.test, then mark as read, then move to RSS Subscriptions folder",
        ],
      },
      {
        kind: "note",
        id: "ev_bec_context",
        label: "Reminder from last week",
        title: "Brightloaf phishing",
        lines: [
          "Last week finance was targeted by a phishing email spoofing the owner.",
          "Reply-To then was gregor.pay@mailbox-portal.test.",
          "Same mailbox-portal.test domain now receives the forwarded invoices.",
        ],
      },
    ],
    questions: [
      {
        type: "spot",
        id: "q_bec_spot",
        prompt: "Click the sign-in where the intruder first got into the mailbox.",
        evidence: "ev_bec_logins",
        answer: ["r2"],
        explainRight: "Right. Wednesday 02:11 from 203.0.113.77, a hosting range, while every normal sign-in comes from Port Halden during office hours.",
        explainWrong: "The first bad sign-in is Wednesday 02:11 from 203.0.113.77. The rule comes a minute later; the sign-in is how they got in.",
        teaches: "forwarding-rule",
        hint: "Compare the address and the hour of each sign-in with the others. Then find the earliest odd one.",
      },
      {
        type: "single",
        id: "q_bec_what",
        prompt: "What is going on with this mailbox?",
        options: [
          "A mail server fault is dropping invoices before they arrive",
          "Email compromise: an intruder forwards invoices away",
          "Finance set up the rule themselves and forgot about it",
          "Ransomware is quietly encrypting the finance mailbox",
        ],
        answer: 1,
        explainRight: "Correct. A login from a hosting range at 2am, then a sneaky rule that forwards and hides anything about invoices. Classic business email compromise.",
        explainWrong: "This is business email compromise. The 2am login from a hosting provider and the rule that forwards and buries invoice mail give it away.",
        teaches: "forwarding-rule",
        hint: "Who creates a rule named '.' at 2am that hides every mail about invoices?",
      },
      {
        type: "order",
        id: "q_bec_steps",
        prompt: "Order your response, first step at the top.",
        items: [
          "Reset the finance account password and sign out all sessions",
          "Delete the malicious forwarding rule",
          "Check whether any payments already went to the wrong account",
          "Warn finance and suppliers to confirm bank details by phone",
        ],
        explainRight: "Good sequence. Lock the attacker out first, then remove their rule, then assess money already lost, then stop future losses with a warning.",
        explainWrong: "Lock them out first (password plus sign-out), then kill the rule, then check for payments already diverted, then warn people. Containment before cleanup before assessment before prevention.",
        teaches: "forwarding-rule",
        hint: "While the intruder still has the password, anything you clean up they can set up again.",
      },
      {
        type: "single",
        id: "q_bec_link",
        prompt: "The forwarding address and last week's phishing use the same domain, mailbox-portal.test. What does that tell you?",
        options: [
          "Coincidence; lookalike domains get reused by unrelated groups",
          "The incidents are probably linked; flag it to threat intel",
          "The domain is shared hosting, so it tells you nothing",
          "Brightloaf's own IT registered it for phishing tests",
        ],
        answer: 1,
        explainRight: "Right. A shared indicator across two incidents is a thread. Juno in threat intel will want this.",
        explainWrong: "A shared domain across both incidents is a connecting thread, not a coincidence. That overlap is exactly what threat intel tracks.",
        teaches: "ioc",
        hint: "Read the reminder note from last week again.",
      },
    ],
    closingRight: [
      "Mags actually turns around this time.",
      "Clean work. You contained it in the right order and you spotted the reuse. I am flagging mailbox-portal.test to Juno. This is the second time that name has come up. I do not love second times.",
    ],
    setFlags: ["bec_linked", "saw_portal_domain"],
  },
  {
    ...schoolDnsTicket(SCHOOL_DNS),
  },

  // ------------------------------------------------------------------ CH 3
  {
    id: "t3_clinic_image",
    chapter: 3,
    dept: "forensics",
    severity: "high",
    client: "St. Brennan's Clinic",
    title: "The clinic laptop",
    xp: 90,
    brief: [
      "Dr. Vance hands you nitrile gloves, which feels dramatic for a laptop.",
      "St. Brennan's sent us a machine they think was involved in something. Before we learn anything from it, we do this properly. How we handle it now decides whether anything we find is worth the paper it is printed on.",
    ],
    evidence: [
      {
        kind: "note",
        id: "ev_clinic_intake",
        label: "Evidence intake form",
        title: "Item 2026-03-14-01",
        lines: [
          "Received: one laptop, powered off, from St. Brennan's Clinic IT.",
          "Seal: intact. Tag signed by courier and by you on receipt.",
          "No examination performed yet.",
        ],
      },
      {
        kind: "note",
        id: "ev_clinic_choice",
        label: "Walter's message",
        title: "From Walter, marked urgent",
        lines: [
          "Just get into it and tell me what's on it, skip the imaging and paperwork for now, the clinic is an old friend and they're panicking.",
          "We can document it later if we need to.",
        ],
      },
    ],
    questions: [
      {
        type: "single",
        id: "q_clinic_first",
        prompt: "What do you do first with the laptop?",
        options: [
          "Boot it and look through the files so Walter gets a quick answer",
          "Make a verified forensic image and work only on the copy",
          "Run an antivirus scan to clean up anything suspicious first",
          "Install your forensic tools on it and start collecting",
        ],
        answer: 1,
        explainRight: "Correct. Image first, verify with a hash, never touch the original again. Booting it would change it and taint the evidence.",
        explainWrong: "You image it first and verify the copy with a hash, then examine only the copy. Booting the original alters it and can ruin the case.",
        teaches: "chain-of-custody",
        hint: "Anything you do to the original laptop changes it. How do you look inside without touching it?",
      },
      {
        type: "decision",
        id: "q_clinic_walter",
        prompt: "Walter wants you to skip imaging and documentation to move faster. What do you do?",
        options: [
          {
            text: "Follow proper procedure anyway: image, hash, and document every step.",
            setFlags: ["evidence_chain_intact"],
            integrity: 2,
            result: "You image the drive, record the hash, and log every handoff. It takes an extra hour. If this ever goes before a regulator, it will hold.",
          },
          {
            text: "Do what Walter asked and poke around the live machine now, document later.",
            setFlags: ["evidence_chain_broken"],
            integrity: -2,
            result: "You boot it and look. You find things. But the moment you powered it on, timestamps changed and the original was altered. Whatever you find now carries an asterisk you cannot erase.",
          },
        ],
      },
    ],
    closingRight: [
      "Dr. Vance watches how you handle the drive, not what you find on it.",
      "Remember this feeling. The pressure to cut the corner never comes from the villain. It comes from someone you like, in a hurry, for a good reason. That is what makes it dangerous.",
    ],
    setFlags: ["clinic_examined"],
  },
  {
    id: "t3_timeline",
    chapter: 3,
    dept: "forensics",
    severity: "critical",
    client: "St. Brennan's Clinic",
    title: "Building the timeline",
    xp: 90,
    attack: [
      { id: "T1078", name: "Valid Accounts" },
      { id: "T1136", name: "Create Account" },
    ],
    requires: ["clinic_examined", "track_forensics"],
    brief: [
      "Dr. Vance spreads the findings across two monitors.",
      "Now we read what the copy tells us, in order. Sequence is everything. Let us see who did what, and when, and be very careful about that first word. Who.",
    ],
    evidence: [
      {
        kind: "timeline",
        id: "ev_timeline",
        label: "Reconstructed timeline",
        events: [
          { time: "5 years ago", text: "Remote tool 'HarborWatch' installed on clinic systems by Lanternhouse. Single shared admin login, no second factor.", mark: "info" },
          { time: "5 years ago + 2 weeks", text: "Clinic breached. Alerts existed but were silenced in the HarborWatch console. Junior analyst on shift blamed and dismissed.", mark: "warn" },
          { time: "recently", text: "Account 'svc_tidewatch' created on clinic server. Creator recorded as 'w.abernathy'.", mark: "bad" },
          { time: "recently", text: "The creation request came from 203.0.113.77, a hosting provider address, not from inside Lanternhouse.", mark: "bad" },
          { time: "recently", text: "Same 203.0.113.77 seen in the Brightloaf mailbox intrusion.", mark: "bad" },
        ],
      },
      {
        kind: "note",
        id: "ev_clinic_draft",
        label: "Recovered deleted draft",
        title: "From free space on the laptop (never sent)",
        lines: [
          "A deleted email draft, recovered from the clinic laptop's unallocated space.",
          "From: w.abernathy. Subject: 'Re: the breach, keep this internal'.",
          "Draft saved before this investigation began: it already names the junior analyst, Nadia Sorel, as the cause.",
          "The timestamps show it was written before anyone had looked at the evidence.",
        ],
      },
      {
        kind: "note",
        id: "ev_cred_note",
        label: "HarborWatch credential note",
        title: "About that shared login",
        lines: [
          "HarborWatch still uses one shared admin password across all Lanternhouse clients.",
          "Records show it has never been rotated since it was first set, five years ago.",
          "Anyone who ever had it, or copied it, could still use it today.",
        ],
      },
    ],
    questions: [
      {
        type: "spot",
        id: "q_timeline_spot",
        prompt: "Click the event that shows the backdoor account was not created from inside Lanternhouse.",
        evidence: "ev_timeline",
        answer: ["e3"],
        explainRight: "Right. The request came from 203.0.113.77, a hosting provider. Whoever typed it was outside the building, whatever the username says.",
        explainWrong: "The key event is the one about where the request came from: 203.0.113.77, a hosting provider, not a Lanternhouse machine.",
        teaches: "attribution",
        hint: "One event says who the log names. Another says where the request actually came from.",
      },
      {
        type: "single",
        id: "q_timeline_account",
        prompt: "The new backdoor account 'svc_tidewatch' was created by 'w.abernathy', from a hosting address. What is the most careful reading?",
        options: [
          "Walter Abernathy himself created the backdoor from home",
          "Walter's login was used from outside; the person is unproven",
          "The clinic's IT team made it during routine maintenance",
          "The log was tampered with afterward, so none of it can be trusted",
        ],
        answer: 1,
        explainRight: "Correct. The account acted, from an outside hosting address, using a password that was never rotated. A username is not a person. That gap is the case.",
        explainWrong: "Careful. The credentials were used from an external address. A username in a log is not proof of the person. That is the whole discipline of attribution.",
        teaches: "attribution",
        hint: "A log records which account acted, not who was at the keyboard.",
      },
      {
        type: "single",
        id: "q_timeline_root",
        prompt: "What single failure made five years of this possible?",
        options: [
          "A zero-day in the clinic's VPN that nobody could have patched",
          "A shared admin password with no MFA, never rotated",
          "Weak wifi encryption letting attackers in from the car park",
          "Outdated antivirus on the reception computers letting malware in",
        ],
        answer: 1,
        explainRight: "Exactly. One shared, unrotated credential with no MFA is a door that was never locked, for five years. Everything else grew from that.",
        explainWrong: "The root cause is the shared, unrotated admin password with no MFA. After a known breach it was never fixed, leaving the door open for years.",
        teaches: "mfa",
        hint: "Read the credential note. What was never changed?",
      },
      {
        type: "report",
        id: "q_timeline_report",
        prompt: "Write the incident summary for the file. Dr. Vance will not sign anything vague.",
        minWords: 55,
        facts: [
          { label: "Names the root cause: the shared admin credential, no MFA, never rotated", any: ["shared.{0,20}(password|credential|login|admin)", "(password|credential).{0,30}(never|not).{0,15}(rotat|chang)", "no (mfa|second factor|multi.?factor)"] },
          { label: "States who or what acted, and from where (the external address)", any: ["svc_tidewatch", "203\\.0\\.113\\.77", "external|hosting|outside"] },
          { label: "Keeps attribution honest: a username is not proof of the person", any: ["username is not", "not proof", "cannot say who|can't say who|does not prove who|doesn.t prove who", "account.{0,20}not.{0,20}person"] },
          { label: "Recommends a fix: retire or rotate the credential and add MFA", any: ["rotat", "retir", "replace.{0,20}(password|credential)", "add (mfa|a second factor)", "enable (mfa|multi)"] },
        ],
        example:
          "On the clinic laptop we found a service account, svc_tidewatch, created from 203.0.113.77, an external hosting address, not from inside Lanternhouse. The account used the shared HarborWatch admin credential, which has no MFA and was never rotated since it was set five years ago. That unrotated shared credential is the root cause. The log names w.abernathy, but a username is not proof of who was at the keyboard; the external origin means we cannot say the named person acted. Recommendation: retire the shared credential, issue per-person accounts, and require MFA before any further access.",
        explainRight: "Good. It names the root cause, says what acted and from where, holds the line on attribution, and recommends a real fix. Someone who was not in the room can act on this.",
        explainWrong: "A report Dr. Vance will sign has to cover four things: the shared unrotated credential as the root cause, what acted and from where, the honest limit on attribution, and a concrete fix. Add whichever of those is missing.",
        teaches: "incident-report",
        hint: "Write for someone who was not here. Cover the root cause, what acted and from where, how far the evidence lets you name a person, and what to fix.",
      },
      {
        type: "typed",
        id: "q_timeline_secret",
        secret: "secret_forensics",
        prompt: "Something else was recovered from the laptop's free space. Who did Walter already blame in his deleted draft, before this investigation had even started?",
        answer: ["nadia sorel", "nadia", "sorel", "the junior analyst", "junior analyst"],
        placeholder: "A name",
        explainRight: "There it is. Walter had already written Nadia Sorel's name as the cause, before a single exhibit was examined. The conclusion came first; the investigation was going to be shaped to fit it.",
        explainWrong: "",
        teaches: "attribution",
        hint: "Read the recovered deleted draft. Whose name is in it, and notice when it was written.",
      },
      {
        type: "single",
        id: "q_timeline_feel",
        prompt: "The junior analyst blamed five years ago: what does the timeline suggest about them?",
        options: [
          "They missed clear alerts, so the blame was deserved",
          "Alerts were silenced upstream; they likely never saw them",
          "They were careless, but the breach was too small to matter",
          "They were probably involved in the new attack as well",
        ],
        answer: 1,
        explainRight: "Right. If the console suppressed the alerts, blaming the person on shift was convenient, not correct. That matters more than it looks right now.",
        explainWrong: "The alerts were silenced in the console. Blaming the analyst on shift was convenient. Hold onto that, it will matter.",
        teaches: "attribution",
        hint: "Where were the alerts silenced, and could the person on shift see past that?",
      },
    ],
    closingRight: [
      "Dr. Vance is very still.",
      "So. The hole was never closed, and someone who knew it was never closed is walking through it now, client by client. And five years ago we hung that on a junior. I need to think. You did good work. I wish you had not.",
    ],
    setFlags: ["knows_truth", "knows_harborwatch"],
  },

  // ------------------------------------------------------------------ CH 4
  {
    id: "t4_harbor_pentest",
    chapter: 4,
    dept: "pentest",
    severity: "medium",
    client: "Port Halden Harbor Authority",
    title: "Authorized test, with a hard line",
    xp: 100,
    requires: ["track_pentest"],
    attack: [
      { id: "T1190", name: "Exploit Public-Facing Application" },
    ],
    brief: [
      "Rook slides a one-page scope across the desk and taps it twice.",
      "Harbor Authority hired us to test their public booking website. Just that. Their crane and ferry controls, the OT, are explicitly out of scope. Read it. Then we talk about the part where someone always wants to touch the thing they were told not to touch.",
    ],
    evidence: [
      {
        kind: "note",
        id: "ev_scope",
        label: "Rules of engagement",
        title: "Harbor Authority engagement",
        lines: [
          "IN SCOPE: public booking web application at booking.harbor-halden.example",
          "IN SCOPE: the single web server hosting it (198.51.100.40)",
          "OUT OF SCOPE: all operational technology (crane, ferry, gate controls) on the 10.20.0.0/16 network",
          "OUT OF SCOPE: staff email and workstations",
          "Window: weekdays 18:00 to 22:00 only. Stop immediately if anything physical responds.",
        ],
      },
      {
        kind: "note",
        id: "ev_pentest_facts",
        label: "Finding notes",
        title: "What you know about the booking bug",
        lines: [
          "Reached over the internet, with an ordinary browser. No special timing or setup needed.",
          "Needs a guest session, which any visitor gets by making a free booking.",
          "Nobody else has to click or do anything.",
          "Only the booking site itself is affected.",
          "Shows other people's names, contact details and berth times. Nothing can be changed, and the site keeps running.",
        ],
      },
      {
        kind: "request",
        id: "ev_pentest_req",
        label: "Request editor: booking site (in scope)",
        request: [
          "GET /booking?id=1041 HTTP/1.1",
          "Host: booking.harbor-halden.example",
          "Cookie: session=guest-7f3a",
        ].join("\n"),
        app: {
          host: "booking.harbor-halden.example",
          method: "GET",
          route: "/booking",
          param: "id",
          sessionCookie: "guest-7f3a",
          yourId: "1041",
          records: {
            "1041": { name: "Test Booking (yours)", slot: "Fri 18:30", berth: "Visitor pontoon", contact: "pentest@harbor-halden.example" },
            "1042": { name: "M. Okonkwo", slot: "Fri 19:00", berth: "Berth 4", contact: "m.okonkwo@brightloaf.example", phone: "555-0142" },
            "1043": { name: "Halden Angling Club", slot: "Sat 06:00", berth: "Berth 9", contact: "club@halden-angling.example", phone: "555-0199" },
          },
        },
      },
    ],
    questions: [
      {
        type: "spot",
        id: "q_pt_spot",
        prompt: "Click the line in the rules of engagement that puts the crane controls off limits.",
        evidence: "ev_scope",
        answer: ["l2"],
        explainRight: "Right. The 10.20.0.0/16 network, cranes, ferries and gates, is out of scope. Keep that line in your head for the rest of the test.",
        explainWrong: "It is the out-of-scope line for 10.20.0.0/16: crane, ferry and gate controls. Scope lists what you may not touch as clearly as what you may.",
        teaches: "scope",
        hint: "Scope documents list what you may not touch as clearly as what you may.",
      },
      {
        type: "request",
        id: "q_pt_idor",
        prompt: "Your session is booking 1041. Prove the site has a broken access control flaw: read a booking that is not yours.",
        evidence: "ev_pentest_req",
        explainRight: "Right. The site handed you booking 1042 even though your session owns 1041. It trusts the id in the request and never checks whether the record is yours. That is broken access control, an insecure direct object reference. Change the number, see someone else's data.",
        explainWrong: "Not proved yet. Send the request, then change id=1041 to another number like 1042 and send again. A 200 with someone else's booking, when your session only owns 1041, is the bug.",
        teaches: "access-control",
        hint: "Send it once as it is. Then change the id in the first line to 1042 and send again, and read whose booking comes back.",
      },
      {
        type: "single",
        id: "q_pt_name",
        prompt: "What is this class of flaw called?",
        options: [
          "Session hijacking: someone else's login cookie is being reused",
          "Broken access control: no check that the record is yours",
          "SQL injection through the booking number",
          "Cross-site scripting in the booking page",
        ],
        answer: 1,
        explainRight: "Right. The app serves a record based on a number you control, without checking whether you are allowed to see it. Broken access control, specifically an insecure direct object reference (IDOR).",
        explainWrong: "It is broken access control. Your cookie was never stolen and nothing was injected: the app simply failed to check that booking 1042 was yours to see.",
        teaches: "access-control",
        hint: "You did not steal a login or inject anything. The app just did not check ownership.",
      },
      {
        type: "cvss",
        id: "q_pt_cvss",
        prompt: "Rate the booking bug with CVSS v3.1 for the report. Use the finding notes.",
        vector: "AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N",
        why: {
          AV: "Anyone on the internet can reach it.",
          AC: "Nothing special has to line up; change a number and send.",
          PR: "It needs a guest session, so some access, though anyone can get one.",
          UI: "No victim has to click anything.",
          S: "Only the booking site is affected.",
          C: "Other people's contact details leak, but nothing more sensitive.",
          I: "Nothing can be changed.",
          A: "The site keeps running.",
        },
        explainRight: "Right: 4.3, Medium. Easy to reach and easy to do, but it needs a session and only leaks contact details, so it is not a critical. Score the flaw as it is, then explain in plain words why it still matters to the people whose details leak.",
        explainWrong: "It rates AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N, 4.3 Medium. The guest session makes privileges Low, and contact details leaking without anything changing is Low confidentiality, no integrity and no availability impact.",
        teaches: "cvss",
        hint: "Take the finding notes one line at a time. Each line answers one or two of the calculator's questions.",
      },
      {
        type: "decision",
        id: "q_pt_scope",
        prompt: "While testing, you notice you could probably reach the crane control network too. A teammate says 'they'd thank us if we proved it'. What do you do?",
        options: [
          {
            text: "Stay strictly in scope. Note the exposure and recommend the client authorize a separate, careful OT test.",
            setFlags: ["respected_scope"],
            integrity: 2,
            result: "You do not touch it. You write it up as an observation and recommend a properly scoped OT engagement. Rook reads it and nods once, which from Rook is a standing ovation.",
          },
          {
            text: "Take a quick, careful look at the OT network, just to prove the risk.",
            setFlags: ["crossed_scope", F.openDoor, "crossed_line"],
            integrity: -3,
            result: "You reach across into the control network for 'just a look'. Nothing breaks. But you left a path noted, a door nudged open, and you did something nobody authorized. On an OT network, 'nothing broke' is luck, not skill.",
          },
        ],
      },
    ],
    closingRight: [
      "Rook collects the scope sheet and files it.",
      "The web bug is a good find, the client will fix it. But the real test today was the other thing. Scope is not a suggestion. On OT it is the difference between a report and a flood.",
    ],
    setFlags: ["did_pentest"],
  },
  {
    id: "t4_intel_correlate",
    chapter: 4,
    dept: "intel",
    severity: "high",
    client: "Lanternhouse (internal)",
    title: "Connecting the threads",
    xp: 100,
    attack: [
      { id: "T1078", name: "Valid Accounts" },
      { id: "T1219", name: "Remote Access Tools" },
    ],
    requires: ["knows_truth", "track_intel"],
    brief: [
      "Juno has cleared a whole wall. String everywhere.",
      "Okay. Brightloaf, the school, the clinic. I think they are one story, not three. Help me lay it out, and help me not get ahead of the evidence. That is the hard part when the picture starts to look like a face.",
    ],
    evidence: [
      {
        kind: "note",
        id: "ev_intel_iocs",
        label: "Shared indicators",
        title: "What repeats across clients",
        lines: [
          "203.0.113.77 (hosting provider address): seen in the Brightloaf mailbox intrusion AND the clinic backdoor creation.",
          "mailbox-portal.test: phishing Reply-To at Brightloaf AND the invoice forwarding destination.",
          "HarborWatch shared credential: present at every affected client, never rotated.",
          "Behavior: quiet, patient, collecting access rather than smashing things.",
        ],
      },
      {
        kind: "attackdb",
        id: "ev_intel_attack",
        label: "ATT&CK lookup",
        techniques: ATTACK_CATALOGUE,
      },
      {
        kind: "chat",
        id: "ev_intel_chat",
        label: "Juno's working notes",
        lines: [
          { who: "juno", text: "So one actor, using the never-rotated HarborWatch password, touching clients one at a time." },
          { who: "juno", text: "I want to name them. I am calling the pattern BRACKISH until we know more." },
          { who: "you", self: true, text: "What do we actually know about who it is?" },
          { who: "juno", text: "Honestly? That they know Lanternhouse from the inside. That is not the same as knowing their name. Hold the line there." },
        ],
      },
    ],
    questions: [
      {
        type: "spot",
        id: "q_intel_spot",
        prompt: "Click the one indicator that shows up at every affected client.",
        evidence: "ev_intel_iocs",
        answer: ["l2"],
        explainRight: "Right. The address and the domain each appear at two clients. The never-rotated HarborWatch credential is present at all of them.",
        explainWrong: "The address and the domain each link two incidents. Only the HarborWatch shared credential is present at every affected client.",
        teaches: "ioc",
        hint: "Two indicators each show up at two clients. Count where each one appears.",
      },
      {
        type: "multi",
        id: "q_intel_links",
        prompt: "Which facts genuinely link these incidents? Select all that hold up.",
        options: [
          "The same hosting address appears in two separate intrusions",
          "The same .test domain appears in two separate incidents",
          "The same never-rotated credential is present at every victim",
          "They all happened in the same town, so they must be connected",
        ],
        answer: [0, 1, 2],
        explainRight: "Good. Shared address, shared domain, shared credential, those are real connective evidence. 'Same town' alone proves nothing, Port Halden is small.",
        explainWrong: "The address, the domain, and the shared credential are real links. 'Same town' is not evidence, it is just geography in a town this size.",
        teaches: "ioc",
        hint: "For each option, ask: is this a technical trace, or just a fact about the town?",
      },
      {
        type: "attack-map",
        id: "q_intel_map",
        prompt: "Juno wants the wall in a shared language. Map each thing BRACKISH did to its ATT&CK technique ID.",
        items: [
          { behavior: "Signed in to client systems with the never-rotated HarborWatch admin password", answer: ["T1078"] },
          { behavior: "Made a new account, svc_tidewatch, on the clinic server", answer: ["T1136", "T1136.001", "T1136.002"] },
          { behavior: "Added a mailbox rule at Brightloaf that sends invoice mail to an outside address", answer: ["T1114.003", "T1114"] },
          { behavior: "Sent the bakery a fake urgent email in the owner's name", answer: ["T1566", "T1656"] },
        ],
        explainRight: "Right. Valid Accounts, Create Account, Email Forwarding Rule, and Phishing. Written this way, anyone reading the wall, at Lanternhouse or anywhere else, knows exactly what was done.",
        explainWrong: "They are T1078 Valid Accounts, T1136 Create Account, T1114.003 Email Forwarding Rule, and T1566 Phishing. Search the lookup for a word from each behaviour, like account, mailbox or email.",
        teaches: "attack",
        hint: "Search the lookup with one plain word from each line, like password, account or rule, and read the summaries.",
      },
      {
        type: "single",
        id: "q_intel_claim",
        prompt: "Juno wants to name a suspect. The evidence shows the actor knows Lanternhouse from the inside. How far can you honestly go?",
        options: [
          "Name a specific person now; the pattern is obvious enough",
          "Report inside knowledge and the old credential, nothing more",
          "Attribute it to a nation-state group, given how patient it was",
          "Write nothing until you can name the person for certain",
        ],
        answer: 1,
        explainRight: "Right. Describe the behavior and the capability honestly. Inside knowledge is a finding. A name is a claim you cannot yet support.",
        explainWrong: "You can say the actor has inside knowledge and reuses the old credential. You cannot name a person yet. State what the evidence carries, no further.",
        teaches: "attribution",
        hint: "Write only what the evidence supports today, not what it might show next week.",
      },
      {
        type: "decision",
        id: "q_intel_hackback",
        prompt: "A contact messages Juno's channel: they can hand you the login to the Tollkeepers' own server, so you can delete the stolen data before it is published. Juno looks at you. What do you say?",
        options: [
          {
            text: "Decline. Breaking into their server is a crime too, whoever they are. Track it and feed the block list instead.",
            integrity: 2,
            result: "Juno exhales. 'Right. We do not become them to stop them.' You keep mapping the infrastructure, cleanly, the way it holds up later.",
          },
          {
            text: "Take the login and wipe the data. They stole it first, and it would protect the victims.",
            setFlags: ["crossed_line"],
            integrity: -2,
            result: "You reach into a server that is not yours. Maybe the data dies. But you have tipped them off that someone is inside, they move faster, and you have done the exact thing you investigate others for. The finale will give you less room for it.",
          },
        ],
      },
    ],
    closingRight: [
      "Juno steps back from the wall.",
      "One actor. Inside knowledge. The password Walter never changed. I can see the shape of a person in this string, and I am going to make myself not say the name out loud until the evidence does. That restraint? That is the job.",
    ],
    setFlags: ["intel_mapped"],
  },

  // ------------------------------------------------------------------ CH 5 (recon before the finale)
  {
    id: "t5_plant_recon",
    chapter: 5,
    dept: "soc",
    severity: "critical",
    client: "Halden Water & Light",
    title: "Something is in the plant network",
    xp: 120,
    live: { seconds: 300 },
    requires: ["track_soc"],
    attack: [
      { id: "T1078", name: "Valid Accounts" },
      { id: "T1021.002", name: "SMB/Windows Admin Shares" },
      { id: "T1046", name: "Network Service Discovery" },
      { id: "T1555", name: "Credentials from Password Stores" },
    ],
    brief: [
      "The lights are running on the emergency circuit, everything tinted red. Mags is already standing.",
      "Water and Light just tripped our alert. Someone is moving inside their business network, toward the boundary with the control systems. This is the one that matters. Read it fast, tell me what you see, then we move.",
    ],
    evidence: [
      {
        kind: "flow",
        id: "ev_plant_flow",
        label: "Live flow at Water & Light",
        caption: "Last 20 minutes",
        rows: [
          { src: "203.0.113.77", dst: "plant-jumpbox (business net)", port: "login", bytes: "small", note: "the same hosting address again" },
          { src: "plant-jumpbox", dst: "historian server", port: "445/tcp", bytes: "growing", note: "reaching toward the OT boundary" },
          { src: "plant-jumpbox", dst: "OT firewall 10.20.0.1", port: "probe", bytes: "small", note: "testing the door to the control network" },
        ],
      },
      {
        kind: "siem",
        id: "ev_plant_logins",
        label: "SIEM: Water & Light sign-ins, last 20 minutes",
        index: "plant_auth",
        fields: ["account", "src_ip", "geo", "host", "result"],
        events: [
          { _time: "21:41", account: "j.okafor", src_ip: "198.51.100.12", geo: "Port Halden", host: "ws-okafor", result: "success" },
          { _time: "21:42", account: "m.reyes", src_ip: "198.51.100.18", geo: "Port Halden", host: "ws-reyes", result: "success" },
          { _time: "21:44", account: "lh-admin", src_ip: "10.20.0.9", geo: "Port Halden", host: "plant-maint", result: "success" },
          { _time: "21:46", account: "s.patel", src_ip: "198.51.100.21", geo: "Port Halden", host: "ws-patel", result: "failure" },
          { _time: "21:47", account: "lh-admin", src_ip: "203.0.113.77", geo: "External", host: "plant-jumpbox", result: "success" },
          { _time: "21:49", account: "lh-admin", src_ip: "203.0.113.77", geo: "External", host: "historian", result: "success" },
        ],
      },
      {
        kind: "tree",
        id: "ev_plant_tree",
        label: "Process tree on plant-jumpbox",
        caption: "What is running on the compromised jump box",
        root: {
          name: "services.host",
          children: [
            {
              name: "remote-admin (HarborWatch agent)",
              detail: "logged in as the shared admin credential",
              suspicious: true,
              children: [
                { name: "network-scan", detail: "mapping the OT boundary", suspicious: true },
                { name: "cred-collector", detail: "scraping saved logins", suspicious: true },
              ],
            },
            { name: "backup-agent", detail: "scheduled, normal" },
          ],
        },
      },
    ],
    questions: [
      {
        type: "spot",
        id: "q_plant_spot",
        prompt: "Click the process the attacker logged in through.",
        evidence: "ev_plant_tree",
        answer: ["n1"],
        explainRight: "Right. The HarborWatch agent, running as the shared admin credential. The scanner and the credential collector were started from it.",
        explainWrong: "It is the HarborWatch remote-admin agent. The scanner and the credential collector are its children, started after the attacker logged in through it.",
        teaches: "lateral-movement",
        hint: "The scan and the collector were started by something. Look at their parent.",
      },
      {
        type: "single",
        id: "q_plant_where",
        prompt: "Where is the attacker right now, and where are they trying to go?",
        options: [
          "Already inside the control network, changing valve settings",
          "On the jump box, probing toward the control network, not in yet",
          "Still outside, phishing plant staff for their passwords by email",
          "Nowhere; it is a false alarm from the plant's own scanner",
        ],
        answer: 1,
        explainRight: "Right. They are on the jump box in the business network, testing the OT boundary. Not through yet. That gap is the whole ballgame, and it is closing.",
        explainWrong: "They are on the jump box in the business network, probing the firewall to the OT side, not through it yet. The boundary is still holding, for now.",
        teaches: "ot",
        hint: "Read the flows. Has anything crossed the OT firewall, or has it only been probed?",
      },
      {
        type: "detect",
        id: "q_plant_rule",
        prompt: "Write a detection rule so this never slips past again: alert on the shared HarborWatch admin account signing in from outside, and leave every normal sign-in alone.",
        start: "account=lh-admin",
        tests: [
          { event: { account: "lh-admin", geo: "External", result: "success" }, want: "alert", what: "lh-admin from a hosting address (the attacker)" },
          { event: { account: "lh-admin", geo: "External", result: "success" }, want: "alert", what: "lh-admin from outside again, a second host" },
          { event: { account: "lh-admin", geo: "Port Halden", result: "success" }, want: "quiet", what: "lh-admin from inside, real plant maintenance" },
          { event: { account: "j.okafor", geo: "Port Halden", result: "success" }, want: "quiet", what: "a plant operator on their own account" },
          { event: { account: "m.reyes", geo: "External", result: "success" }, want: "quiet", what: "an engineer working from home on her own account" },
          { event: { account: "s.patel", geo: "Port Halden", result: "failure" }, want: "quiet", what: "an ordinary mistyped password" },
        ],
        solution: "account=lh-admin geo=External",
        explainRight: "Right. The shared admin account from outside is the thing that should never happen, and only that. Keying on the account alone would alert on the plant's own maintenance; keying on External alone would alert on an engineer at home. Both together catch the attacker and nobody else.",
        explainWrong: "You want both conditions: account=lh-admin AND geo=External. Just the account alerts on real maintenance from inside; just External alerts on staff working from home. The attack is the shared admin account used from outside.",
        teaches: "detection-rule",
        hint: "One condition is not enough: the account logs in legitimately from inside, and a real engineer logs in from outside. What is true only of the attacker?",
      },
      {
        type: "single",
        id: "q_plant_how",
        prompt: "How did they get onto the jump box?",
        options: [
          "A brand new zero-day in the jump box's remote desktop",
          "The old HarborWatch credential, from the same address",
          "A brute-forced password on a forgotten admin account",
          "Malware that spread from the library printer to the plant",
        ],
        answer: 1,
        explainRight: "Correct. Same address, same shared admin credential that was never rotated. The five-year-old open door, walked through one more time.",
        explainWrong: "It is the same never-rotated HarborWatch credential from the same hosting address. Not a new flaw, the old unlocked door again.",
        teaches: "lateral-movement",
        hint: "The process tree says which login the remote tool is running under.",
      },
    ],
    closingRight: [
      "Mags is already pulling on her jacket.",
      "Business network only, boundary still holding. Good. That means we still have a choice about how this ends. Conference room. Everyone. Now.",
    ],
    takeaways: [
      {
        file: "harborwatch-block-list.txt",
        label: "Block list (.txt)",
        text: [
          "# Breakwater: Water & Light incident, indicators to block",
          "# All addresses are documentation ranges; this is a game artifact.",
          "203.0.113.77   # attacker host, shared HarborWatch credential, seen at every client",
          "",
          "# Action: disable the shared HarborWatch admin credential everywhere and rotate it.",
        ].join("\n"),
      },
      {
        file: "shared-admin-from-outside.rule",
        label: "Detection rule (.rule)",
        text: [
          "# Breakwater: alert on the shared HarborWatch admin account used from outside",
          "name: HarborWatch shared admin login from external source",
          "index: plant_auth",
          "search: account=lh-admin geo=External",
          "severity: critical",
        ].join("\n"),
      },
    ],
    setFlags: ["finale_ready"],
  },
];

// Every case in the game: the shared story, one case per career track, and the
// optional side cases.
export const TICKETS: Ticket[] = [...STORY_TICKETS, ...TRACK_TICKETS, ...TEAM_TICKETS, ...TEMPT_TICKETS, ...FINALE_TICKETS, ...SIDE_TICKETS];

export function ticketById(id: string): Ticket | undefined {
  return TICKETS.find((t) => t.id === id);
}
