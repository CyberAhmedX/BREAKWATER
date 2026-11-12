// The browser build published on the website is a demo: the screening and the
// first chapters, ending with a way to carry the run into the full game. The
// desktop app and a plain `npm run build` are always the full game. The demo
// is switched on at build time with VITE_DEMO=1 (see the deploy workflow).

export const DEMO: boolean = import.meta.env?.VITE_DEMO === "1";

/** The last chapter the demo plays through. */
export const DEMO_LAST_CHAPTER = 2;

/** Where the full game is downloaded from. */
export const FULL_GAME_URL = "https://github.com/CyberAhmedX/BREAKWATER/releases/latest";

/** Whether a run at this chapter has reached the end of the demo. */
export function demoOver(chapter: number, demo: boolean = DEMO): boolean {
  return demo && chapter > DEMO_LAST_CHAPTER;
}
