# Changelog

All notable changes to Breakwater, newest first. This file follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

Download: https://github.com/CyberAhmedX/BREAKWATER/releases/latest &middot; Demo: https://cyberahmedx.github.io/BREAKWATER/

## [Unreleased]

### Added
- **A desktop app.** The game now also builds as a PC game in its own window for Windows, Linux and macOS, with installers attached to each release. F11 or Alt+Enter toggles fullscreen, saving a file opens a native "Save as" dialog, and the main menu has Quit to desktop. The browser version plays the same.
- **A main menu.** The game opens on a menu: Continue, New game, Replay a chapter, Practice a case, Endings and achievements, Import a save and Settings. Up and down move through it.

- **The office is the desk.** Between cases you are in the room itself. Your screen opens the tickets, the second screen blinks when alerts are waiting and opens the queue, and the corkboard opens Field Notes. Each has a real button over it, so it works with a keyboard and a screen reader, and on a narrow screen the buttons line up along the bottom instead.
- **Storm lighting.** Rain now falls outside the window, with beads running down the glass, cloud banks, and a sea that heaves as the weather turns. Screens, lamps and the server rack's lights glow through the dark. Lightning shows as a bolt in the sky, lights the room through the window and throws the frame's shadow across the floor. In chapter five the lamps gutter and a red emergency beacon turns on the wall. Reduced motion keeps all of it still.

- **Your screen is a desktop.** A case now opens on LanternOS: each piece of evidence is a window with a title bar, and your analysis is a window beside them. Windows can be minimized, or maximized when a tool wants the whole screen, and a taskbar lists them with the weather and a clock. On a phone the taskbar is the quick way between the evidence and your notes.
- **Colleagues in the office.** Your team lead works at the other desk, and a visitor with a mug stands by the window, a different one each chapter. Each answers a click.
- **The sound of the room.** Under the music: the hum of the server rack, someone typing across the room, a foghorn out in the harbor once the weather turns, and wind in the gale and the storm. All of it synthesized, and on the same volume slider as the music and rain.
- **Feedback.** A stamp lands when a case closes, each chapter opens on a title card, a wrong submit shakes the panel, and in the live finale it flashes the screen. Reduced motion stills these.

### Changed
- **The browser version is now the demo.** The website plays the screening and the first two chapters, then points to the download. A save exported from the demo imports into the full game, so nothing is replayed.
- Releases carry the desktop installers only. The single HTML file is no longer attached.
- You are asked for your name after choosing New game, on the job application, instead of on the first screen.

## [3.1.0] - 2026-11-10

### Added
- **A hands-on task in every screening.** The fifth question is now one small job on the team's own tool: a SIEM search, an email header, a firewall rule order, a hash check, a scope check or a passive DNS pivot. Each sitting draws its own.
- **An alert queue.** From chapter two, five alerts arrive each chapter and there is time to open three (two on hard mode). How you handle them can come back later in the story. The queue pays no XP, so rank still measures the cases.
- **Tools in chapter four.** Each team's chapter four case now gives you a hands-on task on that team's tools before the decision.
- A lab copy of the old HarborWatch login in the chapter three pentest case, tested in the request editor, and a CVSS rating for it. Every hands-on tool now appears in at least two cases.
- **A skills summary**, on the ending card and in Settings: the tools you used and on which cases, the ATT&CK techniques covered, and how the run went. Downloads as one self-contained page.
- A new achievement, Signal and Noise, for a flawless alert queue across a run.

### Changed
- **Ten cases now change between runs** instead of two: the guest wifi, MFA fatigue, USB timeline, external test, leak site, the SOC chapter four case and the pentest and intel finales join the password spray and the school DNS tunnel.
- **Earlier choices close endings.** Some choices in chapters three and four now close off endings. Every path leaves at least two ways out.
- A closed option is now shown with the choice that closed it, instead of silently disappearing. This applies in the finale too.
- The app controller is split into one file per screen. No change in behaviour.
- The browser tests run on Playwright 1.63, which supports the Ubuntu image GitHub's runners now use, and every multi-team test is one test per team.
- The README demo and screenshots are retaken, with two new ones for the alert queue and the skills summary.

### Fixed
- A save or chapter checkpoint written by an older version is filled in with any newer fields when it is loaded, and a save with no run seed is given one that is written back at once.

## [3.0.0] - 2026-11-02

### Changed
- **Renamed the game from Dwell Time to BREAKWATER.** Title screen, topbar, share cards, build outputs, docs, and all references updated.
- **Renamed "interview" to "screening"** throughout: types, functions, UI text, file names, and test descriptions. The six team screenings now say "Screener" instead of "Interviewer".
- Existing saves are migrated automatically: old localStorage keys, transfer codes (DWELL1./DWELL0.), file format, and field names (interviewScore/interviewFails) are all still accepted on load but new values are written on save.
- New README with updated name, subtitle, and terminology.
- Updated screenshots.

## [2.2.1] - 2026-10-20

### Added
- Cases that change between runs: some cases are generated fresh each run, so the addresses, account names and logs are not the same twice. Replaying means reading the evidence again, not recalling an answer.
- New-player onboarding: the first time you meet a hands-on tool (SIEM, terminal, firewall, admin console, timeline builder, pivot board, CVSS calculator, detection rules, reports and more), a one-line tip shows how to drive it, with an example.
- A setting to skip story scenes you have already read on a replay. It never skips a scene with a choice.
- A "Why?" button that folds long answer explanations behind a tap, so feedback stays short at a glance.
- A "Stuck?" link in every case, and judgment-call choices now show their weight the moment you make them.

### Fixed
- A SIEM search could crash on an unusually long or malformed value; it now reports a friendly error. Added adversarial tests so the terminal, SIEM, firewall, detection-rule and request tools all handle bad input gracefully.
- A late-game decision could still be offered after it no longer changed the outcome, and an earlier choice now carries through to how the story ends.
- Tidied unused story flags, added a missing test for the finale timer, and removed an unused unsafe HTML code path.

## [2.1.0] - 2026-10-19

### Added
- A fast-dialogue setting, clickable office details that reveal lore and Field Notes, and a private security policy for reporting issues.
- The audience is stated on the title screen and in the README: students and beginners getting ready for a SOC or help desk job.

### Changed
- Harder choices and a tighter hard-mode finale clock.

### Fixed
- Answer and story-flag fixes from an audit, and clearer wrong-option wording so the right answer does not stand out by length.

## [2.0.0] - 2026-10-18

### Added
- A hands-on tool for every team: a terminal, SIEM search, a firewall rule editor, an admin console, a timeline builder, a request editor, a pivot board, a scope checker, a CVSS calculator, detection rules, incident reports and ATT&CK mapping.
- Team storylines through the whole game, a secret for each team to uncover, and a live, timed finale.

### Changed
- Chapter two to five cases rebuilt around the new tools instead of multiple choice.

## [1.1.0] - 2026-10-17

### Added
- Settings, an endings gallery, achievements and chapter select.
- Click-the-evidence questions, paid hints and ATT&CK tags.
- A case for each career track and a side case in every chapter.
- Save export and import, and browser tests that play the game to every ending.

### Fixed
- Answer reveal, rank pacing, the title screen, keyboard dialogue and ending logic. Shuffled and rewrote answer options so the right one does not stand out.

## [1.0.0] - 2026-10-17

### Added
- First public release: a five-chapter narrative cybersecurity career game that runs offline in a single self-contained HTML file.
