import type { Dept, Ticket } from "../engine/types";
import { DEPT_LABEL } from "../engine/types";
import { freshSave, wipe, rankTitle, conduct, accuracy } from "../engine/state";
import { resolveEnding, ENDINGS, ENDING_ORDER } from "../engine/endings";
import { TEXT_SCALES, saveMeta, wipeMeta, freshMeta, checkpointCopy } from "../engine/meta";
import { ACHIEVEMENTS } from "../engine/achievements";
import { makeBundle, bundleToCode, bundleToFile, readSave, fileName } from "../engine/transfer";
import { audio } from "../audio/audio";
import { ticketById } from "../content/tickets";
import { CHAPTERS, chapterPlan } from "../content/chapters";
import { CODEX } from "../content/codex";
import { SECRETS } from "../content/secrets";
import { el, mount } from "./dom";
import { drawShareCard, shareFileName } from "./sharecard";
import { type Host, stat } from "./host";

// Everything that opens over the game: field notes, settings, the record of
// endings and achievements, save export and import, chapter select, practice
// and the share card.

// ----------------------------------------------------------------- share card
export async function openShareCard(host: Host, ending: ReturnType<typeof resolveEnding>): Promise<void> {
  const canvas = await drawShareCard({
    ending,
    playerName: host.s.playerName,
    team: host.s.track ? DEPT_LABEL[host.s.track] : "",
    conduct: conduct(host.s).tier,
    accuracy: Math.round(accuracy(host.s) * 100),
    hard: host.s.hard,
    extra: shareExtra(host),
  });
  const img = el("img", { class: "share-img", alt: `Share card: ${ending.title}, ${ending.rankTitle}` }) as HTMLImageElement;
  img.src = canvas.toDataURL("image/png");
  const status = el("p", { class: "transfer-status", role: "status" });
  const download = el("button", { class: "btn primary", type: "button", text: "Download image" });
  download.addEventListener("click", () => {
    audio.click();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: shareFileName(ending, host.s.playerName) });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Saved to your downloads.";
    }, "image/png");
  });
  overlay(host, "Share your ending", [img, el("div", { class: "btn-row" }, [download]), status]);
}

// ----------------------------------------------------------------- practice
export function openPractice(host: Host): void {
  const list = el("div", { class: "codex-list" });
  const { close } = overlay(host, "Practice a case", [
    el("p", { class: "muted", text: "Work any case you have closed before, as many times as you like. Hints are free here, and nothing you do touches your run, your record or your achievements." }),
    list,
  ]);
  for (const plan of CHAPTERS) {
    const cases = [...plan.main, ...plan.side].filter((id) => host.meta.casesEver.includes(id)).map(ticketById).filter((t): t is Ticket => !!t);
    if (!cases.length) continue;
    list.append(el("p", { class: "practice-chapter", text: `${plan.title}: ${plan.subtitle}` }));
    for (const t of cases) {
      const b = el("button", { class: "btn choice", type: "button" }, [
        el("span", { class: "cs-title", text: t.title }),
        el("span", { class: "cs-note", text: `${t.client} · ${t.team ?? DEPT_LABEL[t.dept]}${t.side ? " · side case" : ""}` }),
      ]);
      b.addEventListener("click", () => {
        audio.click();
        close();
        host.startPractice(t);
      });
      list.append(b);
    }
  }
}

// ----------------------------------------------------------------- overlays
export function openCodex(host: Host): void {
  const overlay = el("div", { class: "overlay" });
  const close = (): void => overlay.remove();
  const entries = CODEX.filter((c) => host.s.codex.includes(c.id));
  const list = el("div", { class: "codex-list" });
  if (entries.length === 0) {
    list.append(el("p", { class: "muted", text: "Empty for now. Field notes unlock as you learn each idea on a real case." }));
  }
  for (const e of entries) {
    list.append(
      el("details", { class: "codex-entry" }, [
        el("summary", {}, [
          el("span", { class: "codex-term", text: e.term }),
          el("span", { class: "codex-dept", text: e.dept === "general" ? "general" : DEPT_LABEL[e.dept as Dept] }),
        ]),
        el("div", { class: "codex-body" }, e.body.map((p) => el("p", { text: p }))),
      ]),
    );
  }
  const panel = el("div", { class: "overlay-panel" }, [
    el("div", { class: "overlay-head" }, [
      el("h2", { text: "Field Notes" }),
      el("span", { class: "muted", text: `${entries.length} of ${CODEX.length} learned` }),
    ]),
    list,
  ]);
  overlay.append(panel);
  panel.append(closeBtn(close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  host.root.append(overlay);
}

export function openSettings(host: Host): void {
  const overlay = el("div", { class: "overlay" });
  const close = (): void => overlay.remove();
  const set = host.meta.settings;
  const changed = (): void => {
    host.applySettings();
    saveMeta(host.meta);
  };

  const slider = (id: string, label: string, value: number, on: (v: number) => void): HTMLElement => {
    const input = el("input", { class: "slider", type: "range", min: 0, max: 100, step: 1, value: Math.round(value * 100), id }) as HTMLInputElement;
    input.addEventListener("input", () => on(Number(input.value) / 100));
    return el("div", { class: "set-row" }, [el("label", { for: id, text: label }), input]);
  };

  // a row of buttons where exactly one is pressed
  const choices = <T,>(label: string, options: { text: string; value: T }[], current: T, on: (v: T) => void): HTMLElement => {
    const group = el("div", { class: "seg", role: "group", "aria-label": label });
    for (const o of options) {
      const b = el("button", { class: "seg-btn", type: "button", text: o.text, "aria-pressed": String(o.value === current) });
      b.addEventListener("click", () => {
        audio.click();
        group.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        on(o.value);
      });
      group.append(b);
    }
    return el("div", { class: "set-row" }, [el("span", { class: "set-label", text: label }), group]);
  };

  const muteBtn = el("button", { class: "btn ghost", type: "button", text: set.muted ? "Unmute" : "Mute" });
  muteBtn.addEventListener("click", () => {
    set.muted = !set.muted;
    muteBtn.textContent = set.muted ? "Unmute" : "Mute";
    changed();
    host.renderTopbar();
  });

  const reset = el("button", { class: "btn danger", type: "button", text: "Erase save and restart" });
  let confirming = false;
  reset.addEventListener("click", () => {
    if (!confirming) {
      confirming = true;
      reset.textContent = "Tap again to confirm. Endings, achievements and settings are kept";
      return;
    }
    wipe();
    host.s = freshSave();
    close();
    host.render();
  });

  const resetAll = el("button", { class: "btn danger ghost-danger", type: "button", text: "Erase everything" });
  let confirmingAll = false;
  resetAll.addEventListener("click", () => {
    if (!confirmingAll) {
      confirmingAll = true;
      resetAll.textContent = "Tap again to erase the save, endings, achievements and settings";
      return;
    }
    wipe();
    wipeMeta();
    host.s = freshSave();
    host.meta = freshMeta();
    host.applySettings();
    close();
    host.render();
  });

  const record = el("button", { class: "btn ghost", type: "button", text: "Endings and achievements" });
  record.addEventListener("click", () => {
    audio.click();
    close();
    openRecord(host);
  });

  const exportBtn = el("button", { class: "btn ghost", type: "button", text: "Export save" });
  exportBtn.addEventListener("click", () => {
    audio.click();
    close();
    openExport(host);
  });
  const importBtn = el("button", { class: "btn ghost", type: "button", text: "Import save" });
  importBtn.addEventListener("click", () => {
    audio.click();
    close();
    openImport(host);
  });

  const statsBlock = host.s.hired
    ? el("div", { class: "set-stats" }, [
        el("div", { class: "set-stats-head", text: "Your record" }),
        el("div", { class: "ending-stats" }, [
          stat("Rank", rankTitle(host.s)),
          stat("Conduct", conduct(host.s).tier),
          stat("Accuracy", `${Math.round(accuracy(host.s) * 100)}%`),
          stat("Clean / total", `${host.s.cleanCloses} / ${host.s.totalCloses}`),
          stat("Botched", String(host.s.botched)),
          stat("Screenings failed", String(host.s.screeningFails)),
        ]),
        el("p", { class: "muted", text: conduct(host.s).note }),
      ])
    : el("span");

  const panel = el("div", { class: "overlay-panel" }, [
    el("div", { class: "overlay-head" }, [el("h2", { text: "Settings" })]),
    statsBlock,
    slider("vol-music", "Music and rain", set.music, (v) => {
      set.music = v;
      changed();
    }),
    slider("vol-effects", "Sound effects", set.effects, (v) => {
      set.effects = v;
      changed();
    }),
    el("div", { class: "set-row" }, [muteBtn]),
    choices(
      "Text size",
      TEXT_SCALES.map((v, i) => ({ text: ["Small", "Normal", "Large", "Larger"][i], value: v as number })),
      set.textScale,
      (v) => {
        set.textScale = v;
        changed();
      },
    ),
    choices(
      "Reduced motion",
      [
        { text: "Follow my device", value: null as boolean | null },
        { text: "On", value: true },
        { text: "Off", value: false },
      ],
      set.reducedMotion,
      (v) => {
        set.reducedMotion = v;
        changed();
      },
    ),
    choices(
      "Relaxed timers",
      [
        { text: "Off", value: false },
        { text: "On: live cases get twice as long", value: true },
      ],
      set.relaxedTimers,
      (v) => {
        set.relaxedTimers = v;
        changed();
      },
    ),
    choices(
      "Fast dialogue",
      [
        { text: "Off", value: false },
        { text: "On: show each conversation at once", value: true },
      ],
      set.fastDialogue,
      (v) => {
        set.fastDialogue = v;
        changed();
      },
    ),
    choices(
      "Skip seen scenes",
      [
        { text: "Off", value: false },
        { text: "On: skip story you have already read", value: true },
      ],
      set.skipSeen,
      (v) => {
        set.skipSeen = v;
        changed();
      },
    ),
    el("div", { class: "set-row" }, [record]),
    el("div", { class: "set-row" }, [
      el("span", { class: "set-label", text: "Your save lives in this browser. Export it as a backup, or to carry on somewhere else." }),
      el("div", { class: "btn-row" }, [exportBtn, importBtn]),
    ]),
    el("div", { class: "set-about" }, [
      el("p", { text: "Breakwater is a work of fiction. Every company, person, address and domain is invented. It teaches real cybersecurity ideas through an imagined investigation." }),
      el("p", { class: "muted", text: "All music and sound is generated in your browser. Nothing is sampled or copied." }),
    ]),
    el("div", { class: "set-row danger-row" }, [reset, resetAll]),
  ]);
  overlay.append(panel);
  panel.append(closeBtn(close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  host.root.append(overlay);
}

export function openRecord(host: Host): void {
  const overlay = el("div", { class: "overlay" });
  const close = (): void => overlay.remove();

  const endings = el("div", { class: "gallery" });
  for (const id of ENDING_ORDER) {
    const e = ENDINGS[id];
    const seen = host.meta.endings.includes(id);
    endings.append(
      el("div", { class: seen ? "gal-item seen" : "gal-item" }, [
        el("div", { class: "gal-title", text: seen ? e.title : "Not found yet" }),
        el("p", { class: "gal-text", text: seen ? e.epigraph : e.hint }),
        seen ? el("p", { class: "gal-rank", text: e.rankTitle }) : el("span"),
      ]),
    );
  }

  const achievements = el("div", { class: "gallery" });
  for (const a of ACHIEVEMENTS) {
    const got = host.meta.achievements.includes(a.id);
    achievements.append(
      el("div", { class: got ? "gal-item seen" : "gal-item" }, [
        el("div", { class: "gal-title", text: a.title }),
        el("p", { class: "gal-text", text: a.desc }),
        el("p", { class: "gal-rank", text: got ? "Earned" : "Not yet" }),
      ]),
    );
  }

  const files = el("div", { class: "gallery" });
  for (const x of SECRETS) {
    const got = host.meta.secretsEver.includes(x.flag);
    files.append(
      el("div", { class: got ? "gal-item seen" : "gal-item" }, [
        el("div", { class: "gal-title", text: got ? x.title : "Not found yet" }),
        el("p", { class: "gal-text", text: got ? x.found : `Only the ${DEPT_LABEL[x.dept]} team can find this one, in chapter three.` }),
        el("p", { class: "gal-rank", text: DEPT_LABEL[x.dept] }),
      ]),
    );
  }

  const panel = el("div", { class: "overlay-panel" }, [
    el("div", { class: "overlay-head" }, [
      el("h2", { text: "Endings" }),
      el("span", { class: "muted", text: `${host.meta.endings.length} of ${ENDING_ORDER.length} seen` }),
    ]),
    endings,
    el("div", { class: "overlay-head sub" }, [
      el("h2", { text: "Achievements" }),
      el("span", { class: "muted", text: `${host.meta.achievements.length} of ${ACHIEVEMENTS.length} earned` }),
    ]),
    achievements,
    el("div", { class: "overlay-head sub" }, [
      el("h2", { text: "Case Files" }),
      el("span", { class: "muted", text: `${host.meta.secretsEver.length} of ${SECRETS.length} secrets` }),
    ]),
    files,
  ]);
  overlay.append(panel);
  panel.append(closeBtn(close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  host.root.append(overlay);
}

export function overlay(host: Host, title: string, body: HTMLElement[]): { overlay: HTMLElement; close: () => void } {
  const overlay = el("div", { class: "overlay" });
  const close = (): void => overlay.remove();
  const panel = el("div", { class: "overlay-panel" }, [el("div", { class: "overlay-head" }, [el("h2", { text: title })]), ...body]);
  overlay.append(panel);
  panel.append(closeBtn(close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  host.root.append(overlay);
  return { overlay, close };
}

export function openExport(host: Host): void {
  const bundle = makeBundle(host.s, host.meta);
  const status = el("p", { class: "transfer-status", role: "status" });

  const download = el("button", { class: "btn primary", type: "button", text: "Download save file" });
  download.addEventListener("click", () => {
    audio.click();
    const url = URL.createObjectURL(new Blob([bundleToFile(bundle)], { type: "application/json" }));
    const a = el("a", { href: url, download: fileName(host.s) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Saved to your downloads. Load it later with Import save.";
  });

  const code = el("textarea", { class: "save-code", readonly: true, rows: 4, "aria-label": "Your save code", spellcheck: "false" }) as HTMLTextAreaElement;
  code.value = "Making your code...";
  void bundleToCode(bundle).then((c) => (code.value = c));
  const copy = el("button", { class: "btn ghost", type: "button", text: "Copy save code" });
  copy.addEventListener("click", async () => {
    audio.click();
    code.select();
    let copied = false;
    try {
      await navigator.clipboard.writeText(code.value);
      copied = true;
    } catch {
      copied = document.execCommand("copy");
    }
    status.textContent = copied ? "Copied. Paste it somewhere safe, or into Import save on another device." : "Select the code above and copy it by hand.";
  });

  overlay(host, "Export save", [
    el("p", { class: "muted", text: "This holds your current run, your endings and achievements, chapter select and your settings." }),
    el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "As a file, for backups and other computers" }), download]),
    el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "As a code, easiest on phones" }), code, copy]),
    status,
  ]);
}

export function openImport(host: Host): void {
  const error = el("p", { class: "transfer-error", role: "alert" });
  const step = el("div");

  const file = el("input", { type: "file", accept: ".json,application/json,text/plain", class: "visually-hidden", id: "save-file" }) as HTMLInputElement;
  const pickFile = el("button", { class: "btn ghost", type: "button", text: "Choose a save file" });
  pickFile.addEventListener("click", () => {
    audio.click();
    file.click();
  });
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    if (f.size > 1_000_000) {
      error.textContent = "That file is far too big to be a Breakwater save.";
      return;
    }
    void check(await f.text());
  });

  const code = el("textarea", { class: "save-code", rows: 4, placeholder: "Paste a save code here", "aria-label": "Save code", spellcheck: "false" }) as HTMLTextAreaElement;
  const loadCode = el("button", { class: "btn ghost", type: "button", text: "Load code" });
  loadCode.addEventListener("click", () => {
    audio.click();
    void check(code.value);
  });

  const pick = el("div", {}, [
    el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "From a save file" }), pickFile, file]),
    el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "From a save code" }), code, loadCode]),
  ]);
  mount(step, pick);

  // Show what is in the save and ask before it replaces anything.
  const check = async (text: string): Promise<void> => {
    const r = await readSave(text);
    if (!r.ok) {
      error.textContent = r.error;
      audio.wrong();
      return;
    }
    error.textContent = "";
    const where = !r.save.hired
      ? "Still applying"
      : r.save.chapter >= 6
        ? "Finished the story"
        : (() => {
            const plan = chapterPlan(r.save.chapter);
            return plan ? `${plan.title}: ${plan.subtitle}` : "";
          })();
    const when = r.exported ? new Date(r.exported).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
    const replacing = host.s.playerName !== "" || host.meta.endings.length > 0;
    const confirm = el("button", { class: "btn primary", type: "button", text: "Load this save" });
    confirm.addEventListener("click", () => {
      audio.click();
      host.s = r.save;
      host.meta = r.meta;
      host.persist();
      host.applySettings();
      done.close();
      host.render();
      host.showToast("Save loaded");
    });
    const back = el("button", { class: "btn ghost", type: "button", text: "Choose a different save" });
    back.addEventListener("click", () => {
      audio.click();
      mount(step, pick);
    });
    mount(
      step,
      el("div", { class: "ending-stats" }, [
        stat("Name", r.save.playerName || "Not signed yet"),
        stat("Rank", rankTitle(r.save)),
        stat("Where", where),
        stat("Endings", `${r.meta.endings.length} of ${ENDING_ORDER.length}`),
      ]),
      when ? el("p", { class: "muted", text: `Exported on ${when}.` }) : el("span"),
      replacing
        ? el("p", { class: "warn", text: "Loading replaces the run, endings, achievements and settings in this browser. Export yours first if you want to keep them." })
        : el("span"),
      el("div", { class: "btn-row" }, [confirm, back]),
    );
    confirm.focus();
  };

  const done = overlay(host, "Import save", [step, error]);
}

export function openChapterSelect(host: Host): void {
  const overlay = el("div", { class: "overlay" });
  const close = (): void => overlay.remove();
  const list = el("div", { class: "codex-list" });
  for (const plan of CHAPTERS) {
    const cp = host.meta.checkpoints[plan.chapter];
    if (!cp) continue;
    const b = el("button", { class: "btn choice", type: "button" }, [
      el("span", { class: "cs-title", text: `${plan.title}: ${plan.subtitle}` }),
      el("span", { class: "cs-note", text: `${cp.playerName}, ${rankTitle(cp)}, ${conduct(cp).tier} conduct` }),
    ]);
    let confirming = false;
    b.addEventListener("click", () => {
      audio.click();
      const inProgress = host.s.playerName !== "" && host.s.chapter < 6;
      if (inProgress && !confirming) {
        confirming = true;
        b.querySelector(".cs-note")!.textContent = "This replaces the run you have in progress. Tap again to confirm";
        return;
      }
      const copy = checkpointCopy(host.meta, plan.chapter);
      if (!copy) return;
      host.s = copy;
      host.persist();
      close();
      host.startSession();
      host.render();
    });
    list.append(b);
  }
  const panel = el("div", { class: "overlay-panel" }, [
    el("div", { class: "overlay-head" }, [el("h2", { text: "Replay a chapter" })]),
    el("p", { class: "muted", text: "Each chapter starts with the choices you had made by then in your most recent run." }),
    list,
  ]);
  overlay.append(panel);
  panel.append(closeBtn(close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  host.root.append(overlay);
}

export function closeBtn(on: () => void): HTMLElement {
  const b = el("button", { class: "overlay-close", type: "button", text: "Close", "aria-label": "Close" });
  b.addEventListener("click", () => {
    audio.click();
    on();
  });
  return b;
}

/** A line for the share card beyond the basics. */
function shareExtra(host: Host): string {
  return host.s.cleanCloses === host.s.totalCloses && host.s.totalCloses > 0 ? "Every case closed clean" : `${host.s.cleanCloses} of ${host.s.totalCloses} cases closed clean`;
}
