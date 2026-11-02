import { describe, it, expect } from "vitest";
import { TICKETS } from "../src/content/tickets";
import { SCREENINGS } from "../src/content/screenings";

// A single-answer question gives itself away if the right option is clearly the
// longest. Keep the correct option within 12 characters of the longest wrong
// one, so length is never the tell.
describe("answer options", () => {
  const singles: { where: string; id: string; options: string[]; answer: number }[] = [];
  for (const t of TICKETS) for (const q of t.questions) if (q.type === "single") singles.push({ where: t.id, ...q });
  for (const iv of SCREENINGS) for (const q of iv.questions) singles.push({ where: `screening:${iv.dept}`, ...q });

  it("the correct option is never clearly the longest", () => {
    for (const q of singles) {
      const correct = q.options[q.answer].length;
      const longestWrong = Math.max(...q.options.filter((_, i) => i !== q.answer).map((o) => o.length));
      expect(correct - longestWrong, `${q.where} / ${q.id}`).toBeLessThanOrEqual(12);
    }
  });
});
