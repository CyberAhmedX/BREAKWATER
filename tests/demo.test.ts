import { describe, expect, it } from "vitest";
import { DEMO, DEMO_LAST_CHAPTER, demoOver } from "../src/engine/demo";

describe("the demo build", () => {
  it("is off unless the build asks for it", () => {
    expect(DEMO).toBe(false);
    expect(demoOver(6)).toBe(false);
  });

  it("plays through its last chapter and stops at the next", () => {
    expect(demoOver(DEMO_LAST_CHAPTER, true)).toBe(false);
    expect(demoOver(DEMO_LAST_CHAPTER + 1, true)).toBe(true);
  });

  it("never cuts the full game short", () => {
    for (let ch = 0; ch <= 6; ch++) expect(demoOver(ch, false)).toBe(false);
  });
});
