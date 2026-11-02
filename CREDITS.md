# Credits and asset provenance

Where everything in Breakwater comes from.

## Written, designed, and coded

All game design, writing, story, characters, code, and the pixel art (drawn from
code, no imported sprites) are original to this project.

## Music and sound

Every sound in the game, the soundtrack and all effects, is **synthesized at
runtime** with the Web Audio API in `src/audio/audio.ts`. There are no audio
files and no samples.

## Fonts

The only bundled third-party assets are three open-source fonts, each under the
SIL Open Font License (OFL), which permits bundling and redistribution:

| Font | Used for | License |
|------|----------|---------|
| Silkscreen | pixel display type (logo, signage) | SIL OFL 1.1 |
| IBM Plex Sans | body and interface text | SIL OFL 1.1 |
| IBM Plex Mono | logs, code, evidence | SIL OFL 1.1 |

They are delivered via the `@fontsource` packages and inlined into the build.

## Libraries

Build and test tooling only (Vite, Vitest, Playwright, ESLint, TypeScript). None of it ships
in the final game; the production build is a single self-contained HTML file.

## License

The code, writing and art are all rights reserved (see `LICENSE`). The fonts
keep their own SIL OFL 1.1 license, and its text ships with the `@fontsource`
packages.
