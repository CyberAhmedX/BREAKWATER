import type { Chapter, SceneLine } from "../engine/types";
import { type QueueAlert, caughtFlag, missedFlag } from "../engine/triage";
import { caseRng, shuffledBy } from "./logs";

// The alert queue: five alerts a chapter, from chapter two on, and time to
// open three. Two in each five are real. The severity is what the tool
// scored, and it is wrong on purpose as often as a real tool is: the loud
// ones are mostly weather, backups and scanners, and the real ones tend to
// arrive marked low, because to a tool they look like ordinary administration.
//
// None of these touch the main story. Catching or missing one changes a line
// or two in the next chapter, or in the epilogue for chapter five.
// Same house rules as everywhere: nothing here points at a real system.

export const QUEUE: QueueAlert[] = [
  // ------------------------------------------------------------------ CH 2
  {
    id: "q2_eicar",
    chapter: 2,
    severity: "high",
    title: "Malware detected and quarantined",
    source: "Halden Schools, IT office PC",
    details: [
      "The file is eicar_test.txt, created a minute earlier by the school's own IT technician.",
      "The antivirus quarantined it the moment it was saved.",
      "The school's change calendar for today reads: yearly antivirus check.",
    ],
    real: false,
    why: "That file is a harmless test string every antivirus is built to flag. The technician was checking the alarm still rings. It does.",
  },
  {
    id: "q2_travel",
    chapter: 2,
    severity: "low",
    title: "Sign-in from a new country",
    source: "Harbor Authority, the harbormaster's mailbox",
    details: [
      "She signed in from Port Halden at 08:10, as she does every day.",
      "The same account signed in again at 08:31, from an address half a world away.",
      "The harbormaster is at her desk this morning. She has not travelled.",
    ],
    real: true,
    why: "Two sign-ins twenty minutes and half a world apart cannot be one person. The tool scored it low because the password was right. That is exactly the problem.",
    who: "mags",
    caught: "Before we start. The harbormaster's sign-in you escalated yesterday: somebody had her password. Theo reset it before they had read a single message. Good catch.",
    missed: "Before we start. The harbormaster's mailbox was read from the other side of the world for a full day before anyone noticed. That alert was in your queue yesterday, marked low.",
  },
  {
    id: "q2_backup",
    chapter: 2,
    severity: "critical",
    title: "Mass file changes on a file server",
    source: "Brightloaf Bakery, file server",
    details: [
      "Forty thousand files were touched between 02:00 and 02:25.",
      "The process is the backup agent, running as the backup service account.",
      "It has done the same thing at 02:00 every night for a year.",
    ],
    real: false,
    why: "A backup touches every file, every night. Same process, same account, same hour. To a rule that only counts files, it looks like ransomware.",
  },
  {
    id: "q2_admin",
    chapter: 2,
    severity: "low",
    title: "Account added to an admin group",
    source: "Halden Schools, directory",
    details: [
      "An account called temp-scanner was added to the Domain Admins group at 23:48.",
      "It was added by a teacher's account, not by anyone in IT.",
      "The school's technician says nobody asked for it, and nobody knows the account.",
    ],
    real: true,
    why: "A teacher's account has no business handing out the keys to the whole school, at midnight, to an account nobody recognises. The tool logs group changes as information. This one is an alarm.",
    who: "theo",
    caught: "The admin account you flagged at the school was not theirs. They pulled it out of Domain Admins before it was ever used. The technician sends biscuits.",
    missed: "The school found a stranger's admin account this morning. It had been sitting in Domain Admins since the night before last. We had the alert. It aged out.",
  },
  {
    id: "q2_lockout",
    chapter: 2,
    severity: "high",
    title: "Brute force: 12 failed sign-ins",
    source: "Halden Schools, the librarian's account",
    details: [
      "Twelve failures in two minutes, all from her own desk PC in the library.",
      "Then one success, from the same desk.",
      "She came back from three weeks of leave this morning. Her password expired while she was away.",
    ],
    real: false,
    why: "One person, one desk, one account, and a success at the end. That is somebody remembering a password, not somebody guessing a hundred of them.",
  },

  // ------------------------------------------------------------------ CH 3
  {
    id: "q3_scanner",
    chapter: 3,
    severity: "high",
    title: "Port scan from inside the network",
    source: "Harbor Authority, staff network",
    details: [
      "One address swept every machine on the staff network in four minutes.",
      "That address is the vulnerability scanner Lanternhouse installed there.",
      "Today is the first Tuesday of the month, the day it is scheduled to run.",
    ],
    real: false,
    why: "A scheduled scanner scanning is the system working. Write the reason on the alert, so nobody chases it next month either.",
  },
  {
    id: "q3_avoff",
    chapter: 3,
    severity: "low",
    title: "Antivirus service stopped",
    source: "Harbor Authority, ticket office PC",
    details: [
      "The antivirus service was stopped by hand at 13:02, not by an update.",
      "Two minutes later a program ran from the Downloads folder.",
      "Nobody in the ticket office says they touched it.",
    ],
    real: true,
    why: "Updates restart antivirus. Someone about to run something they should not stops it first. Stopped by hand, then an unknown program: the order is the story.",
    who: "priya",
    caught: "The ticket office PC you escalated: they had it off the network within the hour. Whatever ran on it never got further than that one machine.",
    missed: "The harbor's ticket office lost three days to a wiped PC. The antivirus on it was switched off by hand first. That was in the queue.",
  },
  {
    id: "q3_cert",
    chapter: 3,
    severity: "critical",
    title: "Certificate expires in 3 days",
    source: "Lanternhouse, public website",
    details: [
      "The certificate for the Lanternhouse website expires on Friday.",
      "Renewal is automatic, and runs on Thursday night.",
      "It has renewed itself without help eleven times in a row.",
    ],
    real: false,
    why: "True, and not an incident. It belongs on a calendar, not in the ear of whoever is on call at three in the morning. Severity is not the same as urgency.",
  },
  {
    id: "q3_upload",
    chapter: 3,
    severity: "medium",
    title: "Large upload to a file-sharing account",
    source: "Brightloaf Bakery, office laptop",
    details: [
      "Six gigabytes went to a personal file-sharing account between 22:10 and 22:40.",
      "The folder sent was called Recipes and supplier contracts.",
      "The laptop belongs to a baker whose last day is Friday.",
    ],
    real: true,
    why: "Not every incident is an outside attacker. Someone leaving and taking the recipes and contracts home is a data loss, and what to do about it is Brightloaf's call. Your job is to make sure they know.",
    who: "theo",
    caught: "Brightloaf rang to say thank you. They had a quiet word with the baker and got the recipes back before they travelled anywhere.",
    missed: "Brightloaf's rye loaf is on the menu at a new place two towns over. Gregor would like to know why nobody told him about the upload.",
  },
  {
    id: "q3_trip",
    chapter: 3,
    severity: "medium",
    title: "Sign-in from outside the country",
    source: "Halden Schools, a teacher's account",
    details: [
      "A teacher signed in from abroad at 19:40.",
      "The school trip left this morning for a museum across the border. She is on the staff list for it.",
      "It was her usual phone, and the sign-in was approved with number matching.",
    ],
    real: false,
    why: "The trip explains it, and she used her own phone with a strong second factor. It has the same name as an account takeover and the opposite answer. Context decides.",
  },

  // ------------------------------------------------------------------ CH 4
  {
    id: "q4_power",
    chapter: 4,
    severity: "critical",
    title: "17 devices unreachable",
    source: "Several clients, harbor side",
    details: [
      "Seventeen devices dropped off monitoring between 18:02 and 18:04.",
      "All of them are on the harbor side, where the power flickered at 18:02.",
      "Fifteen are already back.",
    ],
    real: false,
    why: "A storm takes the power, the power takes the devices, the devices raise the alarms. One cause, seventeen alerts. Group them, note the cause, and keep your eyes for what the storm is hiding.",
  },
  {
    id: "q4_shadow",
    chapter: 4,
    severity: "low",
    title: "Restore points deleted",
    source: "Halden Schools, file server",
    details: [
      "A command that deletes every saved restore point on the server ran at 19:20.",
      "It ran from an admin session that had started four minutes earlier.",
      "No maintenance is booked, and the school's technician went home at 17:00.",
    ],
    real: true,
    why: "Wiping the restore points is what a ransomware crew does just before it encrypts, so there is no easy way back. On one line it reads like housekeeping. It is the last warning you get.",
    who: "mags",
    caught: "Quickly, before tonight gets worse. The school's file server: you called it. They pulled the cable with the restore points gone and nothing encrypted yet. Whoever it was did not get that one.",
    missed: "Quickly, before tonight gets worse. The school's file server was encrypted before morning. The restore points were wiped first, at 19:20. That alert sat in your queue, marked low.",
  },
  {
    id: "q4_vpn",
    chapter: 4,
    severity: "high",
    title: "VPN sign-ins up 400 percent",
    source: "St. Brennan's Clinic, VPN",
    details: [
      "Four times the usual number of staff are on the VPN tonight.",
      "The clinic closed early for the storm and told everyone to work from home.",
      "Every sign-in is a known member of staff, from their usual address in town.",
    ],
    real: false,
    why: "The baseline moved because the day moved. Known people, known addresses, and a reason. A spike is a question, not an answer.",
  },
  {
    id: "q4_device",
    chapter: 4,
    severity: "medium",
    title: "Unknown device on the network",
    source: "Harbor Authority, gate office",
    details: [
      "A device nobody has registered joined the gate office network at 20:15.",
      "It is asking every machine near it which services it runs.",
      "The gate office has been empty since the storm warning at 17:00.",
    ],
    real: true,
    why: "An empty office, a new device, and it is mapping the network. A storm night is when someone walks in with a small box and a cable. Send someone, or shut the port.",
    who: "priya",
    caught: "And the harbor gate office: security found a little box taped under a desk. The port is dead and the box is in an evidence bag. Imani says thank you for the present.",
    missed: "And the harbor gate office: somebody has had a box plugged in under a desk there since the gale. It has mapped the whole staff network. It joined at 20:15 that night, and the alert aged out.",
  },
  {
    id: "q4_internet",
    chapter: 4,
    severity: "high",
    title: "Inbound scan from the internet",
    source: "Lanternhouse, office firewall",
    details: [
      "An outside address tried three hundred ports on the office firewall in a minute.",
      "Every one of them was blocked.",
      "The address belongs to a well known survey project that scans the whole internet, every day.",
    ],
    real: false,
    why: "The internet knocks on every door, all day. Blocked at the edge and from a known survey, it is weather. If one of those tries had been allowed, that would be the alert.",
  },

  // ------------------------------------------------------------------ CH 5
  {
    id: "q5_ups",
    chapter: 5,
    severity: "critical",
    title: "Server room running on battery",
    source: "Lanternhouse, server room",
    details: [
      "The office went onto battery when the grid failed at 21:40.",
      "The generator took over the load three minutes later.",
      "The battery is back to charging.",
    ],
    real: false,
    why: "The lights are red for the same reason. It is the grid, and the generator has it. Nothing here needs a person.",
  },
  {
    id: "q5_payroll",
    chapter: 5,
    severity: "low",
    title: "Payroll bank details changed",
    source: "St. Brennan's Clinic, payroll system",
    details: [
      "The bank account the clinic's payroll run pays into was changed at 21:52.",
      "The request came by email, from the practice manager's address.",
      "Payroll runs at 06:00 tomorrow. The practice manager is at home, in the dark, with no power.",
    ],
    real: true,
    why: "Somebody is using the loudest night of the year to redirect a payroll run. It cannot wait for morning. One phone call to the practice manager, on the number on file, settles it.",
    caught: "One smaller thing from that night. The clinic's payroll went to the right accounts at six the next morning, because somebody made a phone call in the dark.",
    missed: "One smaller thing from that night. The clinic's payroll went to an account in another country at six the next morning. The alert was in the queue, marked low, under louder ones.",
  },
  {
    id: "q5_door",
    chapter: 5,
    severity: "high",
    title: "Door forced: server room",
    source: "Lanternhouse, door controller",
    details: [
      "The server room door reported forced at 21:41.",
      "Its lock is electric, and lets go when the power drops.",
      "Celeste is standing in the doorway with a torch, and says so in the channel.",
    ],
    real: false,
    why: "The lock let go when the grid did, and someone you trust has eyes on the door. A physical alert needs a physical check. This one has had it.",
  },
  {
    id: "q5_dns",
    chapter: 5,
    severity: "medium",
    title: "DNS failures at four clients",
    source: "Four clients, one internet provider",
    details: [
      "Name lookups have been failing at four clients since 21:40.",
      "All four use the same internet provider.",
      "The provider's status line says its Port Halden exchange is on backup power.",
    ],
    real: false,
    why: "Priya would like it noted that it is DNS, and also that it is the weather. One provider, one cause, and it is theirs to fix.",
  },
  {
    id: "q5_factor",
    chapter: 5,
    severity: "low",
    title: "Second factor changed",
    source: "Brightloaf Bakery, the owner's account",
    details: [
      "The second factor on Gregor's account was switched from his phone app to a text message at 21:47.",
      "The new phone number is not one Brightloaf has on file for anyone.",
      "Gregor is at home with no power, and has not touched his account all evening.",
    ],
    real: true,
    why: "Moving the second factor to a number the attacker holds is how a stolen password becomes a permanent key. It scores low because the account itself approved the change.",
    caught: "And Gregor Brightloaf still has his own mailbox. He never found out how close it came to being someone else's.",
    missed: "And Gregor Brightloaf spent a week locked out of his own mailbox, while someone else answered his suppliers. The change that did it was made the night of the storm.",
  },
];

/** How many alerts arrive each chapter. */
export const QUEUE_SIZE = 5;

/** This chapter's alerts, in the order this run's queue lists them. Empty before chapter two. */
export function queueFor(chapter: Chapter, seed: number): QueueAlert[] {
  const mine = QUEUE.filter((a) => a.chapter === chapter);
  return mine.length ? shuffledBy(caseRng(seed, `queue_${chapter}`), mine) : [];
}

/**
 * What the story says about the alerts of one chapter once the day is over:
 * a line for each real one, depending on whether it was caught or missed.
 * Spoken ones name their speaker; the rest are narration for the epilogue.
 */
export function queueAftermath(chapter: Chapter): SceneLine[] {
  return QUEUE.filter((a) => a.chapter === chapter && a.real).flatMap((a) => [
    { who: a.who ?? "narration", text: a.caught ?? "", showIf: [caughtFlag(a.id)] },
    { who: a.who ?? "narration", text: a.missed ?? "", showIf: [missedFlag(a.id)] },
  ]);
}
