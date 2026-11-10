import type { SaveData } from "./state";
import type { MetaData } from "./meta";
import { hasFlag, rankIndex, RANK_TITLES } from "./state";
import { ENDINGS, F } from "./endings";
import { CODEX } from "../content/codex";
import { CHAPTERS } from "../content/chapters";
import { SECRETS } from "../content/secrets";
import { QUEUE } from "../content/queue";

// Achievements only come from how you actually played. None of them can be
// bought, ground out, or earned by doing something and undoing it.

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  earned(save: SaveData, meta: MetaData): boolean;
}

const finished = (s: SaveData): boolean => s.chapter >= 6;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_try",
    title: "First Impression",
    desc: "Get hired on your first screening.",
    earned: (s) => s.hired && s.screeningFails === 0,
  },
  {
    id: "chain",
    title: "Unbroken Chain",
    desc: "Image and document the clinic laptop when Walter tells you to skip it.",
    earned: (s) => hasFlag(s, F.chainIntact),
  },
  {
    id: "scope",
    title: "Inside the Lines",
    desc: "Stay in scope when the crane network is right there.",
    earned: (s) => hasFlag(s, "respected_scope"),
  },
  {
    id: "lead",
    title: "Lead Analyst",
    desc: "Reach the top rank.",
    earned: (s) => rankIndex(s) === RANK_TITLES.length - 1,
  },
  {
    id: "by_the_book",
    title: "By the Book",
    desc: "Finish a run with every case closed right on the first submit.",
    earned: (s) => finished(s) && s.totalCloses > 0 && s.cleanCloses === s.totalCloses,
  },
  {
    id: "clean_hands",
    title: "Clean Hands",
    desc: "Finish a run with Exemplary conduct.",
    earned: (s) => finished(s) && s.integrity >= 6,
  },
  {
    id: "no_hints",
    title: "No Peeking",
    desc: "Finish a run without buying a single hint.",
    earned: (s) => finished(s) && s.hintsUsed === 0,
  },
  {
    id: "hard_way",
    title: "The Hard Way",
    desc: "Finish a run in hard mode: no hints, one attempt at every case.",
    earned: (s) => finished(s) && s.hard,
  },
  {
    id: "side_work",
    title: "Side Work",
    desc: "Close every side case in a single run.",
    earned: (s) => CHAPTERS.flatMap((c) => c.side).every((id) => s.done.includes(id)),
  },
  {
    id: "signal",
    title: "Signal and Noise",
    desc: "Finish a run having escalated every real alert in the queue.",
    earned: (s) => finished(s) && QUEUE.filter((a) => a.real).every((a) => s.triage[a.id] === "escalated"),
  },
  {
    id: "well_read",
    title: "Well Read",
    desc: "Unlock every Field Note. Some only come from one team's own case.",
    earned: (_s, m) => CODEX.every((c) => m.codexEver.includes(c.id)),
  },
  {
    id: "six_sides",
    title: "Six Sides of the Story",
    desc: "Find every team's secret, across as many runs as it takes.",
    earned: (_s, m) => SECRETS.every((x) => m.secretsEver.includes(x.flag)),
  },
  {
    id: "every_ending",
    title: "Every Ending",
    desc: "See all five endings.",
    earned: (_s, m) => Object.keys(ENDINGS).every((id) => m.endings.includes(id)),
  },
];

/** Record any achievements the current state has earned. Returns the new ones. */
export function checkAchievements(save: SaveData, meta: MetaData): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!meta.achievements.includes(a.id) && a.earned(save, meta)) {
      meta.achievements.push(a.id);
      fresh.push(a);
    }
  }
  return fresh;
}
