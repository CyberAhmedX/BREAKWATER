// Core data model for Breakwater. Content is plain data so it can be unit tested.

import type { Flow as FirewallFlow } from "./firewall";
import type { ConsoleAction, ConsoleGoal, ConsoleIntruder, ConsoleUser } from "./console";
import type { TimelineSource } from "./timeline";
import type { WebApp } from "./webapp";
import type { PivotDb } from "./pivot";
import type { TestEvent } from "./detect";
import type { ReportFact } from "./report";

export type Dept = "soc" | "network" | "helpdesk" | "forensics" | "pentest" | "intel";

export const DEPTS: Dept[] = ["soc", "network", "helpdesk", "forensics", "pentest", "intel"];

export const DEPT_LABEL: Record<Dept, string> = {
  soc: "Security Operations",
  network: "Network Engineering",
  helpdesk: "Help Desk",
  forensics: "Digital Forensics",
  pentest: "Penetration Testing",
  intel: "Threat Intelligence",
};

export type Chapter = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// A flag is any named boolean the story sets and later reads.
export type Flag = string;

export interface Ranks {
  readonly titles: readonly string[];
  readonly thresholds: readonly number[]; // xp needed to reach each title index
}

// ---------- Evidence ----------
// Each evidence item renders in its own viewer. Realistic, defanged content only.

export interface EmailEvidence {
  kind: "email";
  id: string;
  label: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  headers?: Record<string, string>;
  body: string[]; // paragraphs
}

export interface LogEvidence {
  kind: "log";
  id: string;
  label: string;
  source: string;
  columns: string[];
  rows: string[][];
}

export interface ChatEvidence {
  kind: "chat";
  id: string;
  label: string;
  lines: { who: string; self?: boolean; text: string; time?: string }[];
}

export interface FlowEvidence {
  kind: "flow";
  id: string;
  label: string;
  caption?: string;
  rows: { src: string; dst: string; port: string; bytes: string; note?: string }[];
}

export interface TreeNode {
  name: string;
  detail?: string;
  suspicious?: boolean;
  children?: TreeNode[];
}

export interface TreeEvidence {
  kind: "tree";
  id: string;
  label: string;
  caption?: string;
  root: TreeNode;
}

export interface TimelineEvidence {
  kind: "timeline";
  id: string;
  label: string;
  events: { time: string; text: string; mark?: "info" | "warn" | "bad" }[];
}

export interface NoteEvidence {
  kind: "note";
  id: string;
  label: string;
  title: string;
  lines: string[];
}

// A read-only terminal over a set of case files. See engine/shell.ts.
export interface TerminalEvidence {
  kind: "terminal";
  id: string;
  label: string;
  files: Record<string, string>; // file name -> contents
}

// A SIEM index you can search. See engine/siem.ts.
export interface SiemEvidence {
  kind: "siem";
  id: string;
  label: string;
  index: string; // index name shown in the search bar
  fields: string[]; // field order for result columns
  events: Record<string, string>[];
}

// A firewall rule set you can edit and test against traffic. See engine/firewall.ts.
export interface FirewallEvidence {
  kind: "firewall";
  id: string;
  label: string;
  zones: Record<string, string[]>; // named address groups; "!range" excludes
  rules: string; // the rules as they stand when you arrive
  flows: FirewallFlow[]; // test traffic, each with the outcome the policy wants
}

// An identity admin console for one organisation. See engine/console.ts.
export interface ConsoleEvidence {
  kind: "console";
  id: string;
  label: string;
  tenant: string; // organisation name shown at the top
  users: ConsoleUser[];
  intruder?: ConsoleIntruder; // comes back if sessions are revoked before the password is reset
}

// Several logs on different clocks, merged onto UTC by the player. See engine/timeline.ts.
export interface MergeEvidence {
  kind: "merge";
  id: string;
  label: string;
  caption?: string;
  sources: TimelineSource[];
}

// A request editor pointed at one fictional web app. See engine/webapp.ts.
export interface RequestEvidence {
  kind: "request";
  id: string;
  label: string;
  app: WebApp;
  request: string; // the raw request you start with
}

// A passive DNS board you can search, to map out infrastructure. See engine/pivot.ts.
export interface PivotEvidence {
  kind: "pivot";
  id: string;
  label: string;
  caption?: string;
  start: string; // the name the case starts you on
  db: PivotDb;
}

// Raw text you read line by line, like an email's full source with every
// Received header. Spot questions can point at any line.
export interface RawEvidence {
  kind: "raw";
  id: string;
  label: string;
  tag: string; // what the viewer is called, like EMAIL SOURCE
  caption?: string;
  text: string;
}

// An engagement's scope, with a checker for addresses and ranges. See engine/scope.ts.
export interface ScopeEvidence {
  kind: "scope";
  id: string;
  label: string;
  inScope: string[]; // addresses or CIDR ranges
  outOfScope: string[];
  note?: string;
}

// One ATT&CK technique in the offline lookup.
export interface AttackTechnique {
  id: string;
  name: string;
  tactic: string;
  summary: string;
}

// A searchable slice of MITRE ATT&CK, to look technique IDs up in.
export interface AttackDbEvidence {
  kind: "attackdb";
  id: string;
  label: string;
  techniques: AttackTechnique[];
}

export type Evidence =
  | AttackDbEvidence
  | ScopeEvidence
  | RawEvidence
  | PivotEvidence
  | RequestEvidence
  | MergeEvidence
  | ConsoleEvidence
  | FirewallEvidence
  | SiemEvidence
  | TerminalEvidence
  | EmailEvidence
  | LogEvidence
  | ChatEvidence
  | FlowEvidence
  | TreeEvidence
  | TimelineEvidence
  | NoteEvidence;

// ---------- Questions ----------

export interface SingleQuestion {
  type: "single";
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explainRight: string;
  explainWrong: string;
  teaches?: string; // codex entry id unlocked
  hint?: string; // a nudge the player can buy with XP; never the answer
}

export interface MultiQuestion {
  type: "multi";
  id: string;
  prompt: string;
  options: string[];
  answer: number[]; // all correct indices
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

export interface OrderQuestion {
  type: "order";
  id: string;
  prompt: string;
  items: string[]; // presented shuffled; correct order is this array order
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Click the right part of an evidence item: a log row, an email header, a
// timeline event. Keys come from pickTargets() in engine/pick.ts.
export interface SpotQuestion {
  type: "spot";
  id: string;
  prompt: string;
  evidence: string; // evidence id within the same ticket
  answer: string[]; // any of these keys counts as right
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

export interface DecisionOption {
  text: string;
  setFlags?: Flag[];
  clearFlags?: Flag[];
  result: string; // narrative consequence shown after choosing
  integrity?: number; // +/- to a hidden integrity meter
}

export interface DecisionQuestion {
  type: "decision";
  id: string;
  prompt: string;
  options: DecisionOption[]; // no single correct answer; choice drives story
}

// Type what you found: an address, a domain, a count. Any route to it counts.
export interface TypedQuestion {
  type: "typed";
  id: string;
  prompt: string;
  answer: string[]; // accepted answers, compared after normalizeAnswer()
  placeholder?: string;
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
  // one command (terminal) or search (SIEM) that finds it; shown after the case
  // closes, and tests check it really does find the answer
  solution?: { evidence: string; command: string };
  // an optional question that digs deeper: it never blocks closing the case,
  // and answering it right sets this flag (a team's secret)
  secret?: string;
}

// Fix the rules in a firewall evidence item until every test flow behaves.
export interface RulesQuestion {
  type: "rules";
  id: string;
  prompt: string;
  evidence: string; // firewall evidence id within the same ticket
  solution: string; // one rule set that works, shown after the case closes
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Fix accounts in a console evidence item. Checked against goals when submitted.
export interface ConsoleQuestion {
  type: "console";
  id: string;
  prompt: string;
  evidence: string; // console evidence id within the same ticket
  goals: ConsoleGoal[]; // each has a label, shown with a tick or a cross once the case closes
  solution: ConsoleAction[]; // one way to do it, in order; tests check it meets every goal
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Set each source's clock in a merge evidence item so the timeline is true.
export interface MergeQuestion {
  type: "merge";
  id: string;
  prompt: string;
  evidence: string; // merge evidence id within the same ticket
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Prove a web app's broken access control by editing and sending a request.
export interface RequestQuestion {
  type: "request";
  id: string;
  prompt: string;
  evidence: string; // request evidence id within the same ticket
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Tick which targets the engagement allows you to test, using the scope checker.
export interface ScopeQuestion {
  type: "scope";
  id: string;
  prompt: string;
  evidence: string; // scope evidence id within the same ticket
  targets: { address: string; what: string }[]; // the right answer comes from engine/scope.ts
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Rate a finding with the CVSS v3.1 calculator.
export interface CvssQuestion {
  type: "cvss";
  id: string;
  prompt: string;
  vector: string; // the expected base vector, like AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N
  why: Partial<Record<"AV" | "AC" | "PR" | "UI" | "S" | "C" | "I" | "A", string>>; // why each metric has its value, shown after
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Paste a block list: every indicator that belongs on it, defanged.
export interface IocQuestion {
  type: "iocs";
  id: string;
  prompt: string;
  answer: string[]; // the indicators, written normally; compared after refanging
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Map behaviours you saw to ATT&CK technique IDs.
export interface MapQuestion {
  type: "attack-map";
  id: string;
  prompt: string;
  items: { behavior: string; answer: string[] }[]; // accepted IDs per behaviour
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Write a detection rule and test it against a replay of known events.
export interface DetectQuestion {
  type: "detect";
  id: string;
  prompt: string;
  start: string; // the rule as it stands when you arrive
  tests: TestEvent[];
  solution: string; // one rule that works, shown after the case closes
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

// Write the incident report; it is checked for the facts it must carry.
export interface ReportQuestion {
  type: "report";
  id: string;
  prompt: string;
  facts: ReportFact[];
  minWords: number;
  example: string; // a model report, shown after the case closes
  explainRight: string;
  explainWrong: string;
  teaches?: string;
  hint?: string;
}

export type Question = ReportQuestion | DetectQuestion | MapQuestion | IocQuestion | CvssQuestion | ScopeQuestion | RequestQuestion | MergeQuestion | ConsoleQuestion | RulesQuestion | TypedQuestion | SingleQuestion | MultiQuestion | OrderQuestion | SpotQuestion | DecisionQuestion;

// A MITRE ATT&CK technique the case involved, for example T1566 Phishing.
export interface AttackTag {
  id: string;
  name: string;
}

// ---------- Tickets ----------

export interface Ticket {
  id: string;
  chapter: Chapter;
  dept: Dept;
  severity: "low" | "medium" | "high" | "critical";
  client: string;
  title: string;
  brief: string[]; // intro dialogue/briefing paragraphs
  evidence: Evidence[];
  questions: Question[];
  xp: number;
  closingRight: string[]; // shown when resolved well
  side?: boolean; // optional side quest
  requires?: Flag[]; // only shows if all flags present
  hideIf?: Flag[]; // hidden if any present
  setFlags?: Flag[]; // set when ticket completed
  attack?: AttackTag[]; // techniques the attacker used, shown once the case is solved
  speaker?: string; // who briefs the case, when it is not the team lead for dept
  team?: string; // team label shown on the case, when it is not the dept's
  live?: { seconds: number }; // a live incident: the case runs against a clock
  takeaways?: Takeaway[]; // files to download once the case is solved
}

// A file the player can take home from a solved case, like a block list.
export interface Takeaway {
  file: string; // download name
  label: string;
  text: string;
}

// ---------- Screening ----------

export interface ScreeningTrack {
  dept: Dept;
  screener: string;
  intro: string[];
  questions: SingleQuestion[]; // the pool; each sitting asks a random handful
  asks: number; // how many questions one sitting asks
  passLine: number; // min correct to be hired
  hiredText: string[];
  rejectedText: string[];
}

// ---------- Story scenes ----------

export interface SceneLine {
  who: string; // character key or "narration"
  text: string;
  showIf?: Flag[]; // line only shown if all these flags are present
}

// A reason an option is closed. It applies when every flag in `all` is set and
// no flag in `none` is. A closed option is still shown, with its note, so the
// player can see which earlier choice shut it.
export interface ChoiceLock {
  all?: Flag[];
  none?: Flag[];
  note: string;
}

export interface SceneChoice {
  text: string;
  setFlags?: Flag[];
  clearFlags?: Flag[];
  integrity?: number;
  reply?: SceneLine[]; // immediate response lines
  requires?: Flag[]; // option only offered if all these flags are present
  hideIf?: Flag[]; // option hidden if any of these flags are present
  locks?: ChoiceLock[]; // shown but closed if any of these applies
}

export interface Scene {
  id: string;
  chapter: Chapter;
  lines: SceneLine[];
  choice?: { prompt: string; options: SceneChoice[] };
  requires?: Flag[];
  hideIf?: Flag[];
  setFlags?: Flag[];
}

// ---------- Codex ----------

export interface CodexEntry {
  id: string;
  term: string;
  dept: Dept | "general";
  body: string[];
}

// ---------- Endings ----------

export interface Ending {
  id: string;
  title: string;
  epigraph: string;
  lines: string[];
  rankTitle: string;
  hint: string; // shown in the endings gallery until you have seen it
}
