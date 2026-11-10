import type { AttackTag, CodexEntry, Ending, Ticket } from "./types";
import { DEPT_LABEL } from "./types";
import { type SaveData, accuracy, conduct, hasFlag, rankTitle } from "./state";
import { type QueueAlert, type TriageStats, triageStats } from "./triage";

// A record of what a player actually did in one run: which tools they drove,
// on which cases, which ATT&CK techniques those cases covered, and how the
// run went. Built only from cases closed properly, so nothing is claimed that
// was not done. It is a record of a game, not a qualification, and says so.

export interface ToolUse {
  tool: string; // plain name of the skill
  cases: string[]; // titles of the cases it was used on
}

export interface SkillsSummary {
  player: string;
  team: string;
  rank: string;
  conduct: string;
  ending: string; // empty while the run is still going
  hard: boolean;
  closed: number; // cases closed properly
  clean: number; // closed right on the first submit
  botched: number;
  accuracy: number; // percent
  hints: number;
  tools: ToolUse[];
  techniques: (AttackTag & { cases: number })[];
  concepts: string[];
  triage: TriageStats;
}

// What a case had the player do, by the tool in its evidence...
const EVIDENCE_SKILL: Partial<Record<Ticket["evidence"][number]["kind"], string>> = {
  terminal: "Command line: grep, cut, sort, uniq, sha256sum, xxd",
  siem: "SIEM searches",
  firewall: "Firewall rules",
  console: "Identity admin: locking down an account",
  merge: "Timelines across time zones",
  request: "HTTP requests, edited by hand",
  pivot: "Passive DNS pivoting",
  scope: "Scope checks before testing",
  raw: "Raw email headers",
};

// ...or by the kind of answer it asked for.
const QUESTION_SKILL: Partial<Record<Ticket["questions"][number]["type"], string>> = {
  cvss: "CVSS v3.1 scoring",
  iocs: "Indicators and defanging",
  "attack-map": "MITRE ATT&CK mapping",
  detect: "Detection rules",
  report: "Incident write-ups",
};

/** The order skills are listed in: evidence tools first, then written work. */
export const SKILL_ORDER: string[] = [...Object.values(EVIDENCE_SKILL), ...Object.values(QUESTION_SKILL)];

/** The skills one case exercises. */
export function skillsOf(t: Ticket): string[] {
  const out = new Set<string>();
  for (const ev of t.evidence) {
    const s = EVIDENCE_SKILL[ev.kind];
    if (s) out.add(s);
  }
  for (const q of t.questions) {
    const s = QUESTION_SKILL[q.type];
    if (s) out.add(s);
  }
  return [...out];
}

export interface SkillsSource {
  tickets: readonly Ticket[];
  codex: readonly CodexEntry[];
  queue: readonly QueueAlert[];
  ending?: Ending; // once the run has one
}

export function skillsSummary(save: SaveData, src: SkillsSource): SkillsSummary {
  // a botched case closed, but the work was not done, so it earns no line here
  // in the order they were met: by chapter, then as the catalogue lists them
  const earned = src.tickets.filter((t) => save.done.includes(t.id) && !hasFlag(save, `botched_${t.id}`)).sort((a, b) => a.chapter - b.chapter);
  const byTool = new Map<string, string[]>();
  const byTechnique = new Map<string, AttackTag & { cases: number }>();
  for (const t of earned) {
    for (const s of skillsOf(t)) byTool.set(s, [...(byTool.get(s) ?? []), t.title]);
    for (const a of t.attack ?? []) {
      const have = byTechnique.get(a.id);
      if (have) have.cases++;
      else byTechnique.set(a.id, { ...a, cases: 1 });
    }
  }
  return {
    player: save.playerName || "Analyst",
    team: save.track ? DEPT_LABEL[save.track] : "",
    rank: rankTitle(save),
    conduct: conduct(save).tier,
    ending: src.ending?.title ?? "",
    hard: save.hard,
    closed: earned.length,
    clean: save.cleanCloses,
    botched: save.botched,
    accuracy: Math.round(accuracy(save) * 100),
    hints: save.hintsUsed,
    tools: SKILL_ORDER.filter((s) => byTool.has(s)).map((tool) => ({ tool, cases: byTool.get(tool)! })),
    techniques: [...byTechnique.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    concepts: src.codex.filter((c) => save.codex.includes(c.id)).map((c) => c.term),
    triage: triageStats(save, src.queue),
  };
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A file name like breakwater-skills-Riley.html */
export function skillsFileName(player: string): string {
  const who = player.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "analyst";
  return `breakwater-skills-${who}.html`;
}

/**
 * The summary as one self-contained page: no scripts, no outside requests,
 * readable in light or dark and when printed. Every value is escaped, since
 * the player's name is free text.
 */
export function skillsHtml(sum: SkillsSummary, date: string): string {
  const facts: [string, string][] = [
    ["Team", sum.team],
    ["Rank reached", sum.rank],
    ...(sum.ending ? ([["Ending", sum.ending]] as [string, string][]) : []),
    ["Conduct", sum.conduct],
    ["Cases closed", String(sum.closed)],
    ["Right on the first submit", `${sum.accuracy}%`],
    ["Hints bought", String(sum.hints)],
    ...(sum.triage.real > 0 ? ([["Real alerts caught", `${sum.triage.caught} of ${sum.triage.real}`]] as [string, string][]) : []),
    ...(sum.hard ? ([["Mode", "Hard: no hints, one attempt a case"]] as [string, string][]) : []),
  ];
  const section = (title: string, body: string): string => (body ? `<section><h2>${esc(title)}</h2>${body}</section>` : "");
  const tools = sum.tools.map((t) => `<li><b>${esc(t.tool)}</b><span>${t.cases.map(esc).join(" &middot; ")}</span></li>`).join("");
  const techniques = sum.techniques.map((t) => `<li><code>${esc(t.id)}</code> ${esc(t.name)}</li>`).join("");
  const concepts = sum.concepts.map((c) => `<li>${esc(c)}</li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Breakwater skills summary: ${esc(sum.player)}</title>
<style>
:root { color-scheme: light dark; --bg: #f6f4ee; --fg: #1b2230; --dim: #5a6475; --line: #d9d4c6; --accent: #9a5b00; }
@media (prefers-color-scheme: dark) { :root { --bg: #0c1118; --fg: #e8ecf3; --dim: #9aa5b8; --line: #263142; --accent: #e4a94a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px 20px 48px; }
h1 { font-size: 26px; margin: 0 0 2px; }
h2 { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin: 30px 0 10px; }
.sub { color: var(--dim); margin: 0; }
dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 20px; margin: 22px 0 0; padding: 16px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
dt { font-size: 12px; color: var(--dim); }
dd { margin: 0; font-weight: 600; }
ul { list-style: none; margin: 0; padding: 0; }
.tools li { padding: 9px 0; border-bottom: 1px solid var(--line); }
.tools span { display: block; color: var(--dim); font-size: 14px; }
.cols { columns: 2 260px; column-gap: 28px; }
.cols li { padding: 3px 0; break-inside: avoid; }
code { font: 13px ui-monospace, Menlo, Consolas, monospace; color: var(--accent); }
footer { margin-top: 34px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--dim); font-size: 13px; }
@media print { body { background: #fff; color: #000; } }
</style>
</head>
<body>
<main>
<h1>${esc(sum.player)}</h1>
<p class="sub">Breakwater skills summary, ${esc(date)}</p>
<dl>${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
${section("Tools used, and on which cases", tools ? `<ul class="tools">${tools}</ul>` : "")}
${section("MITRE ATT&CK techniques in the cases closed", techniques ? `<ul class="cols">${techniques}</ul>` : "")}
${section("Concepts covered", concepts ? `<ul class="cols">${concepts}</ul>` : "")}
<footer>This is a record of one play-through of Breakwater, a cybersecurity career game with fictional cases. It lists only what was done in cases closed properly. It is not a certificate or a qualification.</footer>
</main>
</body>
</html>
`;
}
