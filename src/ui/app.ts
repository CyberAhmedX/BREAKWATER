import type { Chapter, Ticket } from "../engine/types";
import { DEPT_LABEL } from "../engine/types";
import {
  type SaveData,
  freshSave,
  load,
  save,
  rankTitle,
  rankIndex,
  rankProgress,
  conduct,
  accuracy,
  setFlag,
  markDone,
  isDone,
  unlockCodex,
  xpForClose,
  hasFlag,
  trackFlag,
} from "../engine/state";
import { resolveEnding, ENDING_ORDER } from "../engine/endings";
import { type MetaData, loadMeta, saveMeta, recordEnding, recordCodex, recordCases, recordSecrets, recordCheckpoint } from "../engine/meta";
import { checkAchievements } from "../engine/achievements";
import { FULL_GAME_URL, demoOver } from "../engine/demo";
import { OfficeScene, type OfficeObject } from "../scene/office";
import { drawPortrait } from "../scene/portraits";
import { audio } from "../audio/audio";
import { SCREENINGS } from "../content/screenings";
import { TICKETS, ticketById } from "../content/tickets";
import { SCENES, sceneById } from "../content/scenes";
import { CHAPTERS, chapterPlan } from "../content/chapters";
import { SECRETS } from "../content/secrets";
import { withRunData } from "../content/vary";
import { QUEUE, queueAftermath, queueFor } from "../content/queue";
import { ageOut, looksLeft, queueOpen, triageStats, waiting } from "../engine/triage";
import { screenTriage } from "./triage";
import { el, mount } from "./dom";
import { isDesktop } from "./platform";
import { chapterCard, stampCase } from "./effects";
import { type CloseGradeInfo, type Host, isVisible, speakerFor, stat } from "./host";
import { screenTitle, screenTrack } from "./title";
import { screenScreening } from "./screening";
import { ticketWorkstation } from "./workstation";
import { playDialogue, playScene } from "./dialogue";
import { openCodex, openExport, openPractice, openRecord, openSettings, openShareCard, openSkills } from "./overlays";

// The app controller: it owns the run and the record, routes between screens,
// and runs the chapter desk, case completion and the ending. The screens
// themselves live in the other ui files and reach back through Host.

export class App implements Host {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  private topbar: HTMLElement;
  readonly scene: OfficeScene;
  s: SaveData;
  meta: MetaData;
  private toasts: HTMLElement;
  // The title screen opens every visit, so returning players press Continue,
  // and that click is what lets the browser start the audio.
  started = false;
  // While a case is practised, this holds the real run; this.s is a scratch copy.
  practice: { real: SaveData } | null = null;

  constructor(root: HTMLElement, bgCanvas: HTMLCanvasElement) {
    this.root = root;
    this.scene = new OfficeScene(bgCanvas);
    this.s = load();
    // saves from before track cases existed: give them their track flag
    if (this.s.hired && this.s.track) setFlag(this.s, trackFlag(this.s.track));
    this.meta = loadMeta();
    this.topbar = el("div", { class: "topbar", role: "banner" });
    this.stage = el("div", { class: "stage" });
    this.toasts = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
    mount(this.root, this.topbar, this.stage, this.toasts);
    this.applySettings();
    this.scene.setChapter(this.s.chapter);
    // thunder follows the flash after a gap: short when the storm is overhead
    this.scene.onStrike = () => {
      const near = this.s.chapter >= 5;
      const delay = near ? 200 + Math.random() * 600 : 900 + Math.random() * 1600;
      setTimeout(() => audio.thunder(near ? 1 : 0.55 + Math.random() * 0.2), delay);
    };
    this.scene.start();
    this.armAudio();
    // Click a bit of the office that is not covered by UI to read some flavor.
    this.root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, textarea, label, .opt, .ord-arrow, .ticket-card, .vn, .overlay, .card, .ws-col, .q-panel, .title-card, .decision-opt, .seg, .slider")) return;
      const lore = this.scene.inspect(e.clientX, e.clientY);
      if (lore) this.showToast(lore, 4200);
    });
    this.render();
  }

  persist(): void {
    // practice never touches the run or the record
    if (this.practice) return;
    save(this.s);
    recordCodex(this.meta, this.s.codex);
    recordCases(this.meta, this.s.done.filter((id) => ticketById(id)));
    recordSecrets(this.meta, this.s.flags);
    for (const a of checkAchievements(this.s, this.meta)) this.showToast(`Achievement: ${a.title}`);
    saveMeta(this.meta);
  }

  applySettings(): void {
    const set = this.meta.settings;
    audio.setMuted(set.muted);
    audio.setMusicVolume(set.music);
    audio.setEffectsVolume(set.effects);
    document.documentElement.style.setProperty("--ts", String(set.textScale));
    const reduce = set.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.toggle("reduce-motion", reduce);
    this.scene.setReducedMotion(set.reducedMotion);
  }

  startSession(): void {
    this.started = true;
    this.wakeAudio();
  }

  /** Start the soundtrack, in the mood of the chapter on screen. Safe to call again. */
  private wakeAudio(): void {
    audio.init();
    audio.startMusic();
    this.syncAudio();
  }

  /** The main menu has its own music. Once a game is running, each chapter has its own. */
  private syncAudio(): void {
    audio.setChapter(this.s.chapter, this.started ? this.s.chapter : 0);
  }

  /** Leave the game for the main menu. The run is saved, and Continue picks it up again. */
  toMenu(): void {
    if (this.practice) {
      this.leavePractice();
      return;
    }
    this.persist();
    this.root.querySelectorAll(".overlay").forEach((o) => o.remove());
    this.started = false;
    this.render();
  }

  // A browser only lets a page make sound once the player has clicked or
  // pressed a key, so the menu's music starts on the first of either. The
  // desktop app has no such rule and starts at once.
  private armAudio(): void {
    const wake = (): void => {
      removeEventListener("pointerdown", wake, true);
      removeEventListener("keydown", wake, true);
      this.wakeAudio();
    };
    addEventListener("pointerdown", wake, true);
    addEventListener("keydown", wake, true);
    if (isDesktop()) this.wakeAudio();
  }

  portrait(key: string, size = 96): HTMLCanvasElement {
    const c = el("canvas", { class: "portrait", width: size, height: size, "aria-hidden": "true" });
    drawPortrait(c, key);
    return c;
  }

  // ----------------------------------------------------------------- top bar
  renderTopbar(): void {
    const prog = rankProgress(this.s);
    const pct = prog.max ? 100 : Math.round((prog.have / prog.need) * 100);
    const left = el("div", { class: "tb-left" }, [el("span", { class: "tb-logo", text: "Breakwater" })]);

    let mid: HTMLElement;
    if (this.practice) {
      mid = el("div", { class: "tb-rank" }, [el("span", { class: "tb-rankname", text: "Practice" }), el("span", { class: "tb-mode", text: "nothing here touches your run" })]);
    } else if (this.s.hired) {
      const con = conduct(this.s);
      const sign = this.s.integrity >= 3 ? "good" : this.s.integrity >= 0 ? "mid" : "bad";
      mid = el("div", { class: "tb-rank" }, [
        el("span", { class: "tb-rankname", text: rankTitle(this.s) }),
        el("span", { class: `tb-conduct ${sign}`, title: con.note }, [
          el("span", { class: "tb-conduct-dot" }),
          el("span", { text: con.tier }),
        ]),
        el("div", { class: "xpbar" }, [el("div", { class: "xpfill", style: `width:${pct}%` })]),
        el("span", { class: "tb-xp", text: prog.max ? "max rank" : `${this.s.xp} XP` }),
      ]);
      if (this.s.hard) mid.append(el("span", { class: "tb-mode", text: "Hard mode" }));
    } else {
      mid = el("div", { class: "tb-rank" }, [el("span", { class: "tb-rankname", text: "Applicant" })]);
    }
    const btns = el("div", { class: "tb-right" }, [
      this.s.hired && !this.practice ? this.iconBtn("Field Notes", () => openCodex(this)) : el("span"),
      this.started && !this.practice ? this.iconBtn("Main menu", () => this.toMenu()) : el("span"),
      this.iconBtn("Settings", () => openSettings(this)),
      this.iconBtn(audio.isMuted ? "Sound off" : "Sound on", () => {
        this.meta.settings.muted = !audio.isMuted;
        this.applySettings();
        saveMeta(this.meta);
        this.renderTopbar();
      }),
    ]);
    mount(this.topbar, left, mid, btns);
  }

  private iconBtn(label: string, on: () => void): HTMLElement {
    const b = el("button", { class: "tb-btn", type: "button", text: label });
    b.addEventListener("click", () => {
      audio.click();
      on();
    });
    return b;
  }

  // ----------------------------------------------------------------- router
  render(): void {
    this.renderTopbar();
    this.scene.setChapter(this.s.chapter);
    // the soundtrack follows the chapter, the same as the room does
    this.syncAudio();
    this.castOffice();
    if (!this.started) {
      screenTitle(this);
      return;
    }
    if (!this.s.hired) {
      if (!this.s.track) {
        if (this.s.playerName === "") screenTitle(this);
        else screenTrack(this);
      } else {
        screenScreening(this);
      }
      return;
    }
    if (this.s.chapter >= 6) {
      this.screenEnding();
      return;
    }
    this.screenChapter();
  }

  // ----------------------------------------------------------------- chapter desk
  screenChapter(): void {
    if (demoOver(this.s.chapter)) {
      this.screenDemoEnd();
      return;
    }
    const plan = chapterPlan(this.s.chapter);
    if (!plan) {
      // past the last chapter: go to ending
      this.s.chapter = 6;
      this.persist();
      this.screenEnding();
      return;
    }
    // play intro scene once
    if (!isDone(this.s, `intro_${plan.chapter}`)) {
      // remember how the run stood when this chapter began, for chapter select
      recordCheckpoint(this.meta, this.s);
      saveMeta(this.meta);
      const sc = sceneById(plan.intro);
      chapterCard(this.root, plan.title, plan.subtitle);
      if (sc) {
        playScene(this, sc, () => {
          markDone(this.s, `intro_${plan.chapter}`);
          this.persist();
          this.screenChapter();
        });
        return;
      }
    }

    const mainTickets = plan.main.map(ticketById).filter(isVisible(this.s)) as Ticket[];
    const sideTickets = plan.side.map(ticketById).filter(isVisible(this.s)) as Ticket[];
    const allMainDone = mainTickets.every((t) => isDone(this.s, t.id));

    const openTickets = [...mainTickets, ...sideTickets].filter((t) => !isDone(this.s, t.id)).length;

    // The alert queue: more comes in than there is time for. From chapter two.
    const alerts = queueFor(this.s.chapter, this.s.seed);
    const alertsOpen = queueOpen(this.s, alerts);
    this.scene.setAlertsWaiting(alertsOpen);

    const head = el("div", { class: "desk-head hub-head" }, [
      el("div", { class: "chapter-badge", text: `${plan.title}` }),
      el("h2", { class: "chapter-title", text: plan.subtitle }),
      el("p", { class: "desk-note", text: allMainDone ? "Caught up. When you are ready, carry on." : "Tickets are waiting on your screen. Work them when you are ready." }),
    ]);
    if (alerts.length) head.append(el("p", { class: "alert-panel-note", text: this.alertNote(alerts, alertsOpen) }));

    // The office is the desk: the things in it are the way in to the work.
    const spots: [OfficeObject, HTMLElement][] = [];
    const spot = (at: OfficeObject, cls: string, name: string, sub: string, lively: boolean, run: () => void): void => {
      const b = el("button", { class: `hot ${cls}${lively ? " lively" : ""}`, type: "button" }, [
        el("span", { class: "hot-tag" }, [el("span", { class: "hot-name", text: name }), el("span", { class: "hot-sub", text: sub })]),
      ]);
      b.addEventListener("click", () => {
        audio.click();
        run();
      });
      spots.push([at, b]);
    };
    spot("tickets", "hot-tickets", "Tickets", openTickets ? `${openTickets} open` : "all closed", openTickets > 0, () => this.screenTickets());
    if (alerts.length) {
      const st = triageStats(this.s, alerts);
      const sub = alertsOpen ? `${waiting(this.s, alerts).length} waiting` : st.calls > 0 ? "worked" : "quiet";
      spot("alerts", alertsOpen ? "hot-alerts alert-queue-open" : "hot-alerts alert-queue-review", "Alerts", sub, alertsOpen, () => screenTriage(this));
    }
    spot("board", "hot-board", "Field notes", "what you have learned", false, () => openCodex(this));

    const footer = el("div", { class: "desk-footer" });
    if (allMainDone) {
      const cont = el("button", { class: "btn primary", type: "button", text: this.s.chapter === 5 ? "Face the storm" : "Continue the day" });
      let warned = false;
      cont.addEventListener("click", () => {
        audio.click();
        // leaving alerts unworked is allowed, but never by accident
        if (alertsOpen && !warned) {
          warned = true;
          cont.textContent = "Alerts are still waiting. Tap again to let them age out";
          return;
        }
        // the day ends: whatever was not called ages out
        ageOut(this.s, alerts);
        this.persist();
        this.runOutro(plan.outro, 0);
      });
      footer.append(cont);
    } else {
      footer.append(el("p", { class: "muted", text: `Close the remaining case${mainTickets.filter((t) => !isDone(this.s, t.id)).length > 1 ? "s" : ""} to continue.` }));
    }

    const dock = el("div", { class: "hub-dock" }, spots.map(([, b]) => b));
    const hub = el("div", { class: "office-hub" }, [head, el("div", { class: "hub-bottom" }, [dock, footer])]);

    // Each button sits over its object in the scene. Where the window is too
    // narrow to show the object, or the heading covers it, the button drops
    // into a row at the bottom, so nothing is ever out of reach.
    const place = (): void => {
      if (!hub.isConnected) {
        removeEventListener("resize", place);
        return;
      }
      const top = head.getBoundingClientRect();
      for (const [at, b] of spots) {
        const r = this.scene.rectOf(at);
        const cx = r.left + r.width / 2;
        const onScreen = innerWidth >= 760 && cx > 70 && cx < innerWidth - 70 && r.top > 58 && r.top + r.height < innerHeight - 120;
        const underHead = r.top - 46 < top.bottom && cx > top.left - 60 && cx < top.right + 60;
        const placed = onScreen && !underHead;
        b.classList.toggle("placed", placed);
        b.style.left = placed ? `${r.left - 4}px` : "";
        b.style.top = placed ? `${r.top - 4}px` : "";
        b.style.width = placed ? `${r.width + 8}px` : "";
        b.style.height = placed ? `${r.height + 8}px` : "";
      }
    };
    addEventListener("resize", place);
    // the rest of the room answers a click with a line about itself
    hub.addEventListener("mousemove", (e) => {
      hub.style.cursor = e.target === hub && this.scene.inspect(e.clientX, e.clientY) ? "help" : "";
    });

    this.stage.className = "stage office";
    mount(this.stage, hub);
    place();
  }

  /** The end of the browser demo: where to get the full game, and how to bring this run along. */
  private screenDemoEnd(): void {
    const get = el("a", { class: "btn primary", href: FULL_GAME_URL, target: "_blank", rel: "noopener", text: "Download the full game" });
    const exp = el("button", { class: "btn ghost", type: "button", text: "Export my save" });
    exp.addEventListener("click", () => {
      audio.click();
      openExport(this);
    });
    const menu = el("button", { class: "btn ghost", type: "button", text: "Back to the menu" });
    menu.addEventListener("click", () => {
      audio.click();
      this.started = false;
      this.render();
    });
    const card = el("div", { class: "title-card demo-end" }, [
      el("p", { class: "title-sub", text: "End of the demo" }),
      el("h2", { class: "chapter-title", text: "The weather is turning" }),
      el("p", { class: "title-blurb", text: `That is the first two chapters, ${this.s.playerName}. Three more are waiting, with the rest of your team's cases, the live finale and all five endings.` }),
      el("p", { class: "title-blurb", text: "The full game is free, for Windows, macOS and Linux. Your run comes with you: export your save here, then choose Import a save on the full game's menu." }),
      el("div", { class: "btn-row" }, [get, exp]),
      menu,
    ]);
    this.stage.className = "stage center";
    mount(this.stage, card);
    get.focus();
  }

  /** Put your colleagues in the room: your team lead at the other desk, and a visitor who changes each chapter. */
  private castOffice(): void {
    const leads = ["mags", "theo", "priya", "imani", "rook", "juno"];
    const lead = this.s.hired && this.s.track ? (SCREENINGS.find((x) => x.dept === this.s.track)?.screener ?? null) : null;
    const others = leads.filter((k) => k !== lead);
    // in the blackout everyone who can be is out on a call
    const visitor = lead && this.s.chapter >= 1 && this.s.chapter <= 4 ? others[this.s.chapter % others.length] : null;
    this.scene.setCast(lead, visitor);
  }

  /** The tickets on your screen: the chapter's cases, and the side case. */
  screenTickets(): void {
    const plan = chapterPlan(this.s.chapter);
    if (!plan) return;
    const tickets = [...plan.main, ...plan.side].map(ticketById).filter(isVisible(this.s)) as Ticket[];
    const head = el("div", { class: "desk-head" }, [
      el("div", { class: "chapter-badge", text: `${plan.title}: ${plan.subtitle}` }),
      el("h2", { class: "chapter-title", text: "Your tickets" }),
      el("p", { class: "desk-note", text: tickets.some((t) => !isDone(this.s, t.id)) ? "Pick one up. The side case is optional, and worth doing." : "Everything here is closed." }),
    ]);
    const queue = el("div", { class: "queue" });
    for (const t of tickets) queue.append(this.ticketCard(t, isDone(this.s, t.id)));
    const back = el("button", { class: "btn ghost", type: "button", text: "Back to the office" });
    back.addEventListener("click", () => {
      audio.click();
      this.screenChapter();
    });
    this.stage.className = "stage";
    mount(this.stage, head, queue, el("div", { class: "desk-footer" }, [back]));
  }

  /** What the alert queue has waiting, in a line. */
  private alertNote(alerts: ReturnType<typeof queueFor>, open: boolean): string {
    const left = looksLeft(this.s, alerts);
    const unopened = waiting(this.s, alerts).length;
    const st = triageStats(this.s, alerts);
    return open
      ? unopened > 0 && left > 0
        ? `${unopened} alert${unopened === 1 ? "" : "s"} waiting, and time to open ${left}. The rest age out when you continue.`
        : "An alert is open and waiting for your call."
      : st.calls > 0
        ? `Alert queue worked. ${st.rightCalls} of ${st.calls} call${st.calls === 1 ? "" : "s"} right.`
        : "Nothing left in the alert queue.";
  }

  private ticketCard(t: Ticket, done: boolean): HTMLElement {
    const card = el("button", { class: `ticket-card sev-${t.severity}${done ? " done" : ""}${t.side ? " side" : ""}`, type: "button" }, [
      el("div", { class: "tk-top" }, [
        el("span", { class: "tk-sev", text: t.severity.toUpperCase() }),
        t.side ? el("span", { class: "tk-side", text: "SIDE" }) : el("span", { class: "tk-dept", text: DEPT_LABEL[t.dept] }),
        done ? el("span", { class: "tk-check", text: "CLOSED" }) : el("span", { class: "tk-xp", text: `${t.xp} XP` }),
      ]),
      el("div", { class: "tk-title", text: t.title }),
      el("div", { class: "tk-client", text: t.client }),
    ]);
    card.addEventListener("click", () => {
      audio.click();
      this.openTicket(t, done);
    });
    return card;
  }

  private runOutro(ids: string[], i: number): void {
    if (i >= ids.length) {
      // advance chapter
      this.s.chapter = (this.s.chapter + 1) as Chapter;
      this.persist();
      this.render();
      return;
    }
    const sc = sceneById(ids[i]);
    if (!sc || !isVisible(this.s)(sc) || isDone(this.s, sc.id)) {
      this.runOutro(ids, i + 1);
      return;
    }
    playScene(this, sc, () => {
      markDone(this.s, sc.id);
      this.persist();
      this.runOutro(ids, i + 1);
    });
  }

  // ----------------------------------------------------------------- ticket
  private openTicket(ticket: Ticket, review: boolean): void {
    // Fill in this run's case data before anything renders or grades, so the
    // evidence on screen and the answers are checked against the same values.
    const t = withRunData(ticket, this.s.seed);
    playDialogue(this, 
      t.brief.map((text) => ({ who: speakerFor(t), text })),
      undefined,
      () => ticketWorkstation(this, t, review),
    );
  }

  completeTicket(t: Ticket, grade: CloseGradeInfo): void {
    if (this.practice) {
      const how = grade.botched ? "Out of attempts. Try it again any time." : grade.wrongAttempts === 0 ? "Solved clean, first try." : `Solved after ${grade.wrongAttempts} wrong submit${grade.wrongAttempts === 1 ? "" : "s"}.`;
      const lines = grade.botched ? [{ who: "narration", text: how }] : [...t.closingRight.map((text) => ({ who: speakerFor(t), text })), { who: "narration", text: `Practice: ${how}` }];
      playDialogue(this, lines, undefined, () => this.leavePractice());
      return;
    }
    const beforeRank = rankIndex(this.s);
    const firstTime = !isDone(this.s, t.id);

    // XP scales with how cleanly you closed it. A clean first-try close earns a
    // bonus; retries dock it; a botched critical case barely pays and costs
    // integrity. Story flags always fire so the game never soft-locks.
    let toastMsg = "";
    if (firstTime) {
      this.s.totalCloses++;
      const gain = xpForClose(t.xp, grade);
      if (grade.botched) {
        this.s.integrity -= 1;
        this.s.botched++;
        setFlag(this.s, `botched_${t.id}`);
        toastMsg = `Case botched, +${gain} XP`;
      } else if (grade.wrongAttempts === 0) {
        this.s.cleanCloses++;
        toastMsg = `Closed clean, +${gain} XP`;
      } else {
        toastMsg = `+${gain} XP`;
      }
      this.s.xp += gain;
      markDone(this.s, t.id);
    }

    (t.setFlags ?? []).forEach((f) => setFlag(this.s, f));
    // You only pick up the field note when you work the case properly.
    if (!grade.botched) {
      t.questions.forEach((q) => {
        if ("teaches" in q && q.teaches) unlockCodex(this.s, q.teaches);
      });
      if (t.attack?.length) unlockCodex(this.s, "attack");
    }
    this.persist();

    if (firstTime) stampCase(this.root, grade.botched, grade.wrongAttempts === 0);

    const rankedUp = rankIndex(this.s) > beforeRank;
    const lines = grade.botched
      ? [
          { who: "narration", text: "The case closes, but not the way anyone wanted. The notes will say it took too long, and that you reached for answers instead of reading the evidence." },
          { who: speakerFor(t), text: "We got there. Barely. On a critical case, barely is how towns end up on the news. Learn from this one." },
        ]
      : t.closingRight.map((text) => ({ who: speakerFor(t), text }));

    playDialogue(this, lines, undefined, () => {
      if (toastMsg) this.showToast(toastMsg);
      if (rankedUp) {
        audio.rankUp();
        this.showToast(`Promoted to ${rankTitle(this.s)}`);
      }
      this.screenChapter();
    });
  }

  // ----------------------------------------------------------------- ending
  private screenEnding(): void {
    const ending = resolveEnding(this.s);
    recordEnding(this.meta, ending.id);
    this.persist();
    const found = SECRETS.filter((x) => hasFlag(this.s, x.flag));
    const lines = [
      { who: "narration", text: `Epilogue. ${ending.epigraph}` },
      ...ending.lines.map((text) => ({ who: "narration", text })),
      // the last night's alert queue: what you caught, and what you let go
      ...queueAftermath(5),
      ...found.map((x) => ({ who: "narration", text: x.ending })),
    ];
    playDialogue(this, lines, undefined, () => {
      const con = conduct(this.s);
      const acc = Math.round(accuracy(this.s) * 100);
      const triage = triageStats(this.s, QUEUE);
      const card = el("div", { class: "ending-card" }, [
        el("div", { class: "ending-kicker", text: "Ending" }),
        el("h1", { class: "ending-title", text: ending.title }),
        el("p", { class: "ending-rank", text: ending.rankTitle }),
        el("p", { class: "ending-epi", text: ending.epigraph }),
        el("div", { class: "ending-stats" }, [
          stat("Conduct", con.tier),
          stat("Case accuracy", `${acc}%`),
          stat("Botched", String(this.s.botched)),
          stat("Screenings failed", String(this.s.screeningFails)),
          stat("Secrets found", `${found.length} of ${SECRETS.length}`),
          ...(triage.real > 0 ? [stat("Real alerts caught", `${triage.caught} of ${triage.real}`)] : []),
          ...(this.s.hard ? [stat("Mode", "Hard")] : []),
        ]),
      ]);
      const again = el("button", { class: "btn primary", type: "button", text: "Play again" });
      again.addEventListener("click", () => {
        audio.click();
        const keepName = this.s.playerName;
        const keepHard = this.s.hard;
        this.s = freshSave();
        this.s.playerName = keepName;
        this.s.hard = keepHard;
        this.persist();
        this.render();
      });
      const share = el("button", { class: "btn ghost small", type: "button", text: "Share card" });
      share.addEventListener("click", () => {
        audio.click();
        void openShareCard(this, ending);
      });
      const record = el("button", { class: "btn ghost small", type: "button", text: "Endings and achievements" });
      record.addEventListener("click", () => {
        audio.click();
        openRecord(this);
      });
      const seen = this.meta.endings.length;
      const total = ENDING_ORDER.length;
      const endings = el("div", { class: "ending-roster" }, [
        el("p", {
          class: "muted",
          text: seen >= total ? "You have seen every ending." : `You have seen ${seen} of ${total} endings. Replay a chapter from the title screen to find the others.`,
        }),
      ]);
      const feedback = el("p", { class: "ending-feedback muted" }, [
        el("span", { text: "Got stuck, or found a bug? " }),
        el("a", { href: "https://github.com/CyberAhmedX/BREAKWATER/issues", target: "_blank", rel: "noopener", text: "Tell me what happened." }),
      ]);
      const skills = el("button", { class: "btn ghost small", type: "button", text: "Skills summary" });
      skills.addEventListener("click", () => {
        audio.click();
        openSkills(this);
      });
      card.append(again, share, skills, record, endings, feedback);
      this.stage.className = "stage center";
      mount(this.stage, card);
    });
  }


  startPractice(t: Ticket): void {
    if (!this.started) this.startSession();
    const real = this.practice?.real ?? this.s;
    // A scratch run that can see the case: hired onto its team, in its chapter,
    // with every flag the real run has, and without hard mode or bought hints.
    const scratch = freshSave();
    scratch.playerName = real.playerName || "Analyst";
    scratch.hired = true;
    scratch.track = t.dept;
    scratch.chapter = t.chapter;
    scratch.flags = real.flags.filter((f) => !f.startsWith("hint:"));
    scratch.seed = real.seed; // practise the case with this run's data, not a new draw
    this.practice = { real };
    this.s = scratch;
    this.scene.setChapter(t.chapter);
    audio.setChapter(t.chapter);
    this.renderTopbar();
    this.openTicket(t, false);
  }

  // Practice starts and ends on the title screen, whatever state the run is in.
  leavePractice(): void {
    if (!this.practice) return;
    this.s = this.practice.real;
    this.practice = null;
    // practice ends on the main menu, so the menu's music comes back
    this.started = false;
    this.syncAudio();
    this.renderTopbar();
    this.scene.setChapter(this.s.chapter);
    screenTitle(this);
    openPractice(this);
  }

  showToast(text: string, ms = 2600): void {
    const t = el("div", { class: "toast", text });
    this.toasts.append(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 400);
    }, ms);
  }
}

// referenced to keep tree-shaking honest in tests
export { SCREENINGS, TICKETS, SCENES, CHAPTERS };
