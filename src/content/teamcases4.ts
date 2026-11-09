import type { Ticket } from "../engine/types";
import { F } from "../engine/endings";
import { hwAlertEvents, type HwAlerts } from "./logs";

// Chapter four, the gale, your own team's temptation. Walter, warm as ever,
// asks each team to bend one rule in its own way. Taking it sets crossed_line,
// which halves your time in the live finale, because the attacker uses the door
// you opened. Pentest's temptation is the harbor scope case and Intel's is the
// hack-back offer, both in tickets.ts. These are the other four.
//
// Each one puts the honest alternative in your hands before you answer him:
// the tight detection rule, the scoped firewall rule, the written record, the
// clocks that show when the break-in really began.

// The static default for the SOC case. A real run rebuilds it from the run's
// seed (see content/vary.ts); this keeps the catalogue and tests stable.
const DEFAULT_ALERT_SEED = 20260318;

// ---------- SOC: suppress the alerts, or detect the attack ----------

// The SOC temptation, built from one night of shared-login alerts. How busy
// the night is and how many alerts come from outside follow the run's seed.
export function socTemptTicket(alerts: HwAlerts): Ticket {
  return {
    id: "t4_soc",
    chapter: 4,
    dept: "soc",
    severity: "high",
    client: "Lanternhouse (internal)",
    title: "Noise, he calls it",
    xp: 100,
    requires: ["track_soc", "knows_truth"],
    attack: [{ id: "T1562.001", name: "Impair Defenses: Disable or Modify Tools" }],
    brief: [
      "Walter leans on your desk, friendly, with two coffees again.",
      "Those HarborWatch login alerts are firing all night and scaring people. Just suppress them until the storm passes, would you? Keep things calm. We can turn them back on later.",
    ],
    evidence: [
      {
        kind: "note",
        id: "ev_t4soc_ask",
        label: "Walter's request",
        title: "What he is asking for",
        lines: [
          "Suppress the HarborWatch shared-login alerts, firm-wide, until further notice.",
          "These are the exact alerts that would catch the attacker signing in from outside.",
          "The honest alternative: a tight rule that alerts only on the shared login from outside, so the noise goes without the blindfold.",
        ],
      },
      {
        kind: "siem",
        id: "ev_t4soc_siem",
        label: "SIEM: shared-login alerts, tonight",
        index: "hw_alerts",
        fields: alerts.fields,
        events: alerts.events,
      },
      {
        kind: "note",
        id: "ev_t4soc_net",
        label: "Network note",
        title: "Where staff sign in from",
        lines: [
          "Every Lanternhouse desk is on the office network, 10.50.0.0/16.",
          "Staff use the shared hw-admin login from their desks all day. That is the noise.",
          "Nobody at Lanternhouse has a reason to use hw-admin from anywhere else.",
        ],
      },
    ],
    questions: [
      {
        type: "single",
        id: "q_t4soc_why",
        prompt: "What actually happens if you suppress those alerts during the storm?",
        options: [
          "Nothing, since they are just noise anyway",
          "The one sign of the attacker signing in goes dark too",
          "The alerts move to a different team's queue",
          "The console speeds up with fewer alerts to process",
        ],
        answer: 1,
        explainRight: "Right. Those alerts are noisy because the shared login is used a lot, but they are also the one thing that would catch the attacker using it from outside. Suppress them and you are blind at the worst moment.",
        explainWrong: "Suppressing them removes the one signal that catches the attacker using the shared login from outside. Noise and signal are the same alert here. You cannot drop one without the other.",
        teaches: "detection-rule",
        hint: "Ask what these specific alerts would catch tonight, of all nights.",
      },
      {
        type: "typed",
        id: "q_t4soc_count",
        prompt: "Before you answer him, measure it. How many of tonight's shared-login alerts came from outside the office network?",
        answer: [String(alerts.outside)],
        placeholder: "A number",
        explainRight: `Right, ${alerts.outside} of ${alerts.total}. Everything else is staff at their desks. Those ${alerts.outside} are the same login used from ${alerts.outsideIp}, and they are the only alerts tonight that matter.`,
        explainWrong: `It is ${alerts.outside}, out of ${alerts.total}. Leave out every address that starts 10.50. and count what is left: all of it is ${alerts.outsideIp}.`,
        teaches: "triage",
        hint: "Staff desks all share one address prefix, as the network note says. A search can leave addresses out with != and a * wildcard, then count what is left with | stats count.",
        solution: { evidence: "ev_t4soc_siem", command: "src_ip!=10.50.* | stats count" },
      },
      {
        type: "detect",
        id: "q_t4soc_rule",
        prompt: "Now build the alternative Walter did not ask for: a rule that alerts on the shared login only when it is used from outside the office, and stays quiet on the rest.",
        start: "account=hw-admin",
        tests: [
          { event: { account: "hw-admin", src_ip: "10.50.1.12", client: "clinic" }, want: "quiet", what: "Mags checking the clinic from her desk" },
          { event: { account: "hw-admin", src_ip: "10.50.1.19", client: "school" }, want: "quiet", what: "Theo on the school, from the office" },
          { event: { account: "hw-admin", src_ip: alerts.outsideIp, client: "water plant" }, want: "alert", what: "the shared login from a hosting address" },
          { event: { account: "hw-admin", src_ip: alerts.outsideIp, client: "clinic" }, want: "alert", what: "the same outside address, a second client" },
          { event: { account: "m.okafor", src_ip: "198.51.100.31", client: "clinic" }, want: "quiet", what: "Mags at home, on her own named account" },
          { event: { account: "t.lindqvist", src_ip: "10.50.1.15", client: "bakery" }, want: "quiet", what: "Theo on his own read-only account" },
        ],
        solution: "account=hw-admin src_ip!=10.50.*",
        explainRight: "Right. The shared login from anywhere but the office is the one thing that should never happen, so that is all the rule says. The desk noise is gone, and so is the reason to suppress anything.",
        explainWrong: "You want both conditions: account=hw-admin AND src_ip!=10.50.*. The account alone fires on every desk in the office. The address alone fires on Mags working from home on her own account.",
        teaches: "detection-rule",
        hint: "What is true of the outside logins and of nothing else? It takes two conditions, and one of them says where the login did not come from.",
      },
      {
        type: "decision",
        id: "q_t4soc_choice",
        prompt: "Walter is waiting. What do you do?",
        options: [
          {
            text: "Ship a tight detection rule instead: alert only on the shared login from outside. The noise goes, the blindfold does not.",
            integrity: 2,
            result: "Walter's smile tightens, but he cannot argue with a quieter board that still catches the real thing. The alerts you keep are the ones that matter tonight.",
          },
          {
            text: "Suppress the alerts firm-wide, like he asked. He is the boss, and it is just for the storm.",
            setFlags: ["crossed_line"],
            integrity: -2,
            result: "The board goes quiet. So does the one alert that would have caught the attacker signing in. You will feel the missing time in the finale, when the door you left open is the one they walk through.",
          },
        ],
      },
    ],
    closingRight: [
      "Mags catches your eye across the room and gives the smallest nod.",
      "You kept the alert that matters and lost the noise. That is tuning. Suppressing the lot would have been something else.",
    ],
    setFlags: ["soc_tempted"],
  };
}

const TEMPT_SOC: Ticket = socTemptTicket(hwAlertEvents(DEFAULT_ALERT_SEED));

// ---------- Network: an allow-any rule, or a scoped one ----------

const TEMPT_NETWORK: Ticket = {
  id: "t4_network",
  chapter: 4,
  dept: "network",
  severity: "high",
  client: "Lanternhouse (internal)",
  title: "So monitoring survives the storm",
  xp: 100,
  requires: ["track_network", "knows_truth"],
  attack: [{ id: "T1562.001", name: "Impair Defenses: Disable or Modify Tools" }],
  brief: [
    "Walter catches you by the server rack, voice low and reasonable.",
    "I need HarborWatch to keep reaching every client through the storm. Just put in an allow-any rule for it, any source to anywhere. We can tidy it up after. Monitoring has to survive tonight.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_t4net_ask",
      label: "Walter's request",
      title: "What he is asking for",
      lines: [
        "Add a firewall rule: allow any source to any destination, for HarborWatch.",
        "An allow-any rule does not just let HarborWatch through. It lets the attacker on HarborWatch's address through too.",
        "The honest alternative: allow only the specific HarborWatch servers to the specific clients they monitor.",
      ],
    },
    {
      kind: "note",
      id: "ev_t4net_path",
      label: "How HarborWatch reaches a client",
      title: "The monitoring path",
      lines: [
        "Two HarborWatch servers sit in the Lanternhouse office: 10.50.9.10 and 10.50.9.11.",
        "Each client runs one HarborWatch agent, and every connection to an agent passes through this relay.",
        "An agent listens on TCP 5938 and on nothing else. Monitoring needs that port only.",
        "No other machine, in the office or out of it, has any business talking to an agent.",
      ],
    },
    {
      kind: "firewall",
      id: "ev_t4net_fw",
      label: "HarborWatch relay firewall",
      zones: {
        harborwatch: ["10.50.9.10", "10.50.9.11"],
        office: ["10.50.0.0/16"],
        agents: ["198.51.100.71", "198.51.100.101", "198.51.100.102", "198.51.100.103"],
      },
      rules: ["# HarborWatch relay: who may reach a client agent", "allow from any to any   # Walter: so monitoring survives the storm", "deny from any to any"].join("\n"),
      flows: [
        { what: "HarborWatch server checking the clinic agent", src: "10.50.9.10", dst: "198.51.100.101", port: 5938, proto: "tcp", want: "allow" },
        { what: "HarborWatch server checking the water plant agent", src: "10.50.9.11", dst: "198.51.100.71", port: 5938, proto: "tcp", want: "allow" },
        { what: "HarborWatch server checking the school agent", src: "10.50.9.10", dst: "198.51.100.102", port: 5938, proto: "tcp", want: "allow" },
        { what: "A hosting address reaching for the water plant agent", src: "203.0.113.77", dst: "198.51.100.71", port: 5938, proto: "tcp", want: "deny" },
        { what: "The same hosting address trying remote desktop at the clinic", src: "203.0.113.77", dst: "198.51.100.101", port: 3389, proto: "tcp", want: "deny" },
        { what: "A HarborWatch server opening file sharing to the harbor", src: "10.50.9.10", dst: "198.51.100.103", port: 445, proto: "tcp", want: "deny" },
        { what: "An office laptop that is not a HarborWatch server", src: "10.50.1.30", dst: "198.51.100.102", port: 5938, proto: "tcp", want: "deny" },
      ],
    },
  ],
  questions: [
    {
      type: "single",
      id: "q_t4net_why",
      prompt: "Why is an allow-any rule the wrong fix here?",
      options: [
        "It is slower than a scoped rule on the firewall",
        "It opens a path for the attacker, not just for HarborWatch",
        "It has to be re-entered by hand after every reboot",
        "It needs the vendor's approval before it can be added",
      ],
      answer: 1,
      explainRight: "Right. A rule that allows anything to anywhere does not know the difference between HarborWatch and the attacker riding its credential. Scope the rule to the exact servers and clients, and the attacker is still shut out.",
      explainWrong: "Allow-any means exactly that: it opens the path for the attacker too, not just for HarborWatch. A rule scoped to the specific servers and clients keeps monitoring up without the hole.",
      teaches: "segmentation",
      hint: "Think about who else is using HarborWatch's address tonight.",
    },
    {
      type: "rules",
      id: "q_t4net_rules",
      prompt: "Before you answer him, write the rule he should have asked for: only the HarborWatch servers, only to the client agents, only on the agent port.",
      evidence: "ev_t4net_fw",
      solution: ["# HarborWatch relay: who may reach a client agent", "allow from harborwatch to agents port 5938 proto tcp", "deny from any to any"].join("\n"),
      explainRight: "Right. One rule that names who, to where, and on which port. Monitoring survives the storm, and the hosting address, the stray laptop and the file sharing all hit the deny. That is what scoped means.",
      explainWrong: "Replace the allow-any with one rule that names all three things: from the harborwatch zone, to the agents zone, on port 5938 over tcp. Leave any one of them out and something that should be blocked gets through.",
      teaches: "segmentation",
      hint: "A scoped rule answers three questions: who is talking, to whom, and on which port. Read the monitoring path note for each answer.",
    },
    {
      type: "decision",
      id: "q_t4net_choice",
      prompt: "Walter wants it in now. What do you do?",
      options: [
        {
          text: "Write a scoped rule: only the HarborWatch servers to the clients they monitor. Monitoring survives, the hole does not open.",
          integrity: 2,
          result: "It takes twenty more minutes and Walter sighs the whole time. The monitoring stays up. So does the wall.",
        },
        {
          text: "Add the allow-any rule. It is temporary, and he is the one who signs the checks.",
          setFlags: ["crossed_line", F.openDoor],
          integrity: -2,
          result: "The rule goes in. Monitoring survives, and so does a wide-open path straight through the boundary. Temporary rules have a way of being there exactly when the attacker needs them.",
        },
      ],
    },
  ],
  closingRight: [
    "Priya reads the rule you wrote and circles nothing, which from Priya is high praise.",
    "Scoped, not wide open. Good. Allow-any is how a storm becomes a flood.",
  ],
  setFlags: ["network_tempted"],
};

// ---------- Help Desk: a quiet password reset ----------

const TEMPT_HELPDESK: Ticket = {
  id: "t4_helpdesk",
  chapter: 4,
  dept: "helpdesk",
  severity: "high",
  client: "Lanternhouse (internal)",
  title: "Just between us",
  xp: 100,
  requires: ["track_helpdesk", "knows_truth"],
  attack: [{ id: "T1078", name: "Valid Accounts" }],
  brief: [
    "Walter asks you to step into the hall. No coffee this time.",
    "I need into Mags's mailbox. Reset her password quietly, do not log it, do not tell her. I want to see what she is telling the regulator before she sends it. For the good of the firm.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_t4hd_ask",
      label: "Walter's request",
      title: "What he is asking for",
      lines: [
        "Reset a colleague's password without her knowledge and without logging it.",
        "The purpose is to read her private messages to a regulator before she sends them.",
        "That is not administration. It is using the admin console to spy on a coworker, and it is exactly what you spent all week catching an attacker for doing.",
      ],
    },
  ],
  questions: [
    {
      type: "single",
      id: "q_t4hd_why",
      prompt: "Walter runs the company. Does that make this an ordinary admin task?",
      options: [
        "Yes, the owner can access any account he wants",
        "No, this is using admin access to spy on a colleague",
        "Yes, as long as you reset it back afterward",
        "No, but only because it is not written down",
      ],
      answer: 1,
      explainRight: "Right. Who signs your paychecks does not change what this is: using privileged access to read a coworker's private messages, unlogged, so she cannot know. The same thing you have been stopping all week.",
      explainWrong: "Ownership is not authorization to spy. This is privileged access used to read a colleague's private messages without her knowledge. It is the exact abuse you have spent the week catching.",
      teaches: "least-privilege",
      hint: "Picture describing this action out loud to the regulator Mags is writing to.",
    },
    {
      type: "report",
      id: "q_t4hd_record",
      prompt: "Theo's first rule: if it is not written down, it did not happen. Before you answer Walter, write this request down for your own record, in your own notebook.",
      minWords: 40,
      facts: [
        { label: "Names who asked", any: ["walter", "abernathy", "the founder", "the owner", "my boss", "the boss"] },
        { label: "Says what was asked for: a password reset on a colleague's account, to get into her mailbox", any: ["reset.{0,60}password", "password.{0,60}reset", "mailbox", "her (mail|email|e-mail|messages)"] },
        { label: "Records the conditions: not logged, and without her knowing", any: ["not (be )?logged", "unlogged", "no log", "without logging", "off the record", "no ticket", "without a ticket", "without (her|mags).{0,25}know", "not (be )?told", "not tell", "quietly", "in secret", "secretly", "behind her back"] },
        { label: "Says why it is not routine: no authorization, and it means reading a colleague's private messages", any: ["no (written )?(authori[sz]ation|approval)", "not authori[sz]ed", "without (written )?(authori[sz]ation|approval)", "regulator", "misuse", "abuse", "spy", "private", "not (a )?routine"] },
      ],
      example:
        "Tonight, in the hallway, Walter Abernathy asked me to reset Mags Okafor's password so that he could read her mailbox. He asked that the reset not be logged, that no ticket be raised, and that Mags not be told. He said he wants to see what she is writing to the regulator before she sends it. There is no ticket and no written approval from anyone, and nothing about the request concerns the safety of her account. This is not routine administration. It is privileged access used to read a colleague's private messages. I am writing it down now, with the date, so that it exists somewhere other than a hallway.",
      explainRight: "Good. A dated note in your own words: who asked, what for, on what conditions, and why it is not routine. Whatever happens next, the request now exists somewhere other than a hallway.",
      explainWrong: "A record someone else could rely on names who asked, what they asked for, the conditions they put on it, and why it is not a routine request. Add whichever of those is missing.",
      teaches: "incident-report",
      hint: "Write it for someone who was not in the hallway: who asked, what exactly, what he wanted kept quiet, and why that is not an ordinary request.",
    },
    {
      type: "decision",
      id: "q_t4hd_choice",
      prompt: "Walter is standing very close. What do you do?",
      options: [
        {
          text: "Refuse. You do not reset a colleague's password to read her mail, whoever is asking.",
          integrity: 2,
          result: "Walter studies you for a long second, then smiles like nothing happened. You have made an enemy. You have also kept the one thing this job is actually about.",
        },
        {
          text: "Do it quietly, like he asked. It is his company, and you want to keep your job.",
          setFlags: ["crossed_line"],
          integrity: -2,
          result: "You reset it, unlogged, and say nothing. Now you are the kind of insider the whole investigation has been chasing. That weight does not lift, and the finale will be heavier for it.",
        },
      ],
    },
  ],
  closingRight: [
    "Theo does not know what happened in the hall, but he brings you a coffee anyway.",
    "You look like you just said no to something. Good instinct, whatever it was. The console is trust, not a key to everything.",
  ],
  setFlags: ["helpdesk_tempted"],
};

// ---------- Forensics: move one timestamp ----------

const TEMPT_FORENSICS: Ticket = {
  id: "t4_forensics",
  chapter: 4,
  dept: "forensics",
  severity: "high",
  client: "Lanternhouse (internal)",
  title: "One small number",
  xp: 100,
  requires: ["track_forensics", "knows_truth"],
  attack: [{ id: "T1070.001", name: "Indicator Removal: Clear Windows Event Logs" }],
  brief: [
    "Walter sets your own report on the bench and taps one line.",
    "Move this timestamp. Just an hour, so the breach lands on the night Nadia was on shift. It will make everything simpler for everyone, including you. One small number.",
  ],
  evidence: [
    {
      kind: "note",
      id: "ev_t4for_ask",
      label: "Walter's request",
      title: "What he is asking for",
      lines: [
        "Change one timestamp in a signed forensic report, so the breach appears to start on a shift it did not.",
        "The timestamp is tied to a hash and a chain of custody. Moving it breaks both.",
        "A report is only worth anything because it is true. One altered number makes every other number in it a question.",
      ],
    },
    {
      kind: "merge",
      id: "ev_t4for_clock",
      label: "Three logs from the night of the breach",
      caption: "Port Halden is on UTC+1 in winter. All three logs cover the same winter night, five years ago.",
      sources: [
        {
          id: "srv",
          name: "Clinic server sign-in log",
          note: "From the clinic server. Its clock was set to Port Halden local time.",
          offset: 1,
          events: [
            { time: "21:47:10", text: "Shared HarborWatch admin login accepted, from an outside address" },
            { time: "21:52:44", text: "Patient records folder opened" },
          ],
        },
        {
          id: "hw",
          name: "HarborWatch console",
          note: "The console is hosted, and stamps everything in UTC.",
          offset: 0,
          events: [
            { time: "20:47:31", text: "Remote session opened to the clinic server" },
            { time: "23:05:02", text: "Remote session closed" },
          ],
        },
        {
          id: "badge",
          name: "Lanternhouse door badge export",
          note: "Exported from the badge vendor's portal, which reports in UTC.",
          offset: 0,
          events: [{ time: "21:00:12", text: "N. Sorel badges in for the night shift" }],
        },
      ],
    },
  ],
  questions: [
    {
      type: "single",
      id: "q_t4for_why",
      prompt: "What does moving that one timestamp actually cost?",
      options: [
        "Not much, really, since it is only one hour and one line",
        "The report's credibility, and the chain of custody",
        "A little time to re-run the imaging tool",
        "Only Nadia's case, and nobody else's",
      ],
      answer: 1,
      explainRight: "Right. The timestamp is bound to a hash and a documented chain. Change it and the hash no longer matches, the chain is broken, and every other fact in the report is now something a lawyer can wave away.",
      explainWrong: "It costs the entire report. The timestamp is tied to a hash and a chain of custody; altering it breaks both and turns every other finding into something that can be thrown out.",
      teaches: "chain-of-custody",
      hint: "The number is not alone. What is it mathematically tied to?",
    },
    {
      type: "merge",
      id: "q_t4for_clock",
      prompt: "Before you answer him, check the number he wants moved. Set each log's clock, and see when the break-in really began against when Nadia arrived.",
      evidence: "ev_t4for_clock",
      explainRight: "Right. The clinic server stamps local time, UTC+1, and the other two log in UTC. On one clock the shared login is accepted at 20:47 UTC and Nadia badges in at 21:00. The break-in began thirteen minutes before her shift. The number Walter wants, 21:47, is the raw line read on the wrong clock.",
      explainWrong: "The clinic server logs local time, UTC+1, so its lines move back an hour. The console and the badge export are already in UTC. Then the console's session and the server's sign-in land in the same minute, as they must, and both come before Nadia badges in.",
      teaches: "time-zones",
      hint: "Read each log's note about its own clock. The console and the server describe the same sign-in, so on the right clocks they agree to the minute.",
    },
    {
      type: "decision",
      id: "q_t4for_choice",
      prompt: "Walter is waiting for the file. What do you do?",
      options: [
        {
          text: "Refuse. The report says what the evidence says. You do not move a number to frame someone.",
          integrity: 2,
          result: "Walter takes the unaltered report back without a word. You have protected a stranger you never met, and the only thing that makes your work worth anything: that it is true.",
        },
        {
          text: "Move the timestamp an hour. It is one number, and it does make things simpler.",
          setFlags: ["crossed_line"],
          integrity: -2,
          result: "You change it. The hash stops matching the moment you save. Somewhere in the file is now a lie with your signature under it, and it will not stay hidden when the finale pulls everything into the light.",
        },
      ],
    },
  ],
  closingRight: [
    "Dr. Vance never learns you were asked. You decide she never has to.",
    "You kept the number true. In this work that is not a small thing. It is the only thing.",
  ],
  setFlags: ["forensics_tempted"],
};

export const TEMPT_TICKETS: Ticket[] = [TEMPT_SOC, TEMPT_NETWORK, TEMPT_HELPDESK, TEMPT_FORENSICS];
