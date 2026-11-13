import { describe, expect, it } from "vitest";
import { SONG_DATA, SONG_NAMES } from "../src/audio/audio";

describe("the chapter music", () => {
  const songs = Object.values(SONG_DATA);

  it("gives every chapter a piece of its own", () => {
    expect(songs).toHaveLength(7);
    expect(new Set(Object.values(SONG_NAMES)).size).toBe(7);
    // no two share a tempo, key and melody
    expect(new Set(songs.map((s) => `${s.step}/${s.root}/${s.lead.join(",")}`)).size).toBe(7);
  });

  it("writes each piece out to the length of its own loop", () => {
    for (const s of songs) {
      expect(s.lead, s.name).toHaveLength(s.chords.length * s.bar);
      expect(s.bass, s.name).toHaveLength(s.bar);
      expect(s.chords.every((c) => c.length >= 3), s.name).toBe(true);
    }
  });

  it("keeps every note in a range a speaker can play", () => {
    for (const s of songs) {
      const notes = [...s.lead.filter((n): n is number => n !== null), ...s.chords.flat()];
      for (const n of notes) {
        const hz = s.root * Math.pow(2, n / 12);
        expect(hz, `${s.name} ${n}`).toBeGreaterThan(60);
        expect(hz, `${s.name} ${n}`).toBeLessThan(2000);
      }
    }
  });
});
