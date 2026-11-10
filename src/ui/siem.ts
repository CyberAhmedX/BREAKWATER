import type { SiemEvidence } from "../engine/types";
import { search, SiemError } from "../engine/siem";
import { el, mount } from "./dom";

// The SIEM screen: a search bar over one index, the fields you can search on,
// and a results table. It opens on the latest events so you can see what the
// data looks like before writing your first search.
//
// Each search run fires a "tool-command" event, so the case can count them.

const SHOW = 100;

export function siemView(ev: SiemEvidence): HTMLElement {
  const input = el("input", {
    class: "siem-input",
    type: "text",
    "aria-label": `Search ${ev.index}`,
    // an example built from this index's own fields, so it is never one that cannot work here
    placeholder: ev.fields.includes("action") && ev.fields.includes("src_ip") ? "action=failure | stats count by src_ip" : `* | stats count by ${ev.fields[ev.fields.length - 1] ?? "_time"}`,
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    enterkeyhint: "search",
  }) as HTMLInputElement;
  const go = el("button", { class: "siem-go", type: "button", text: "Search" });
  const bar = el("div", { class: "siem-bar" }, [el("span", { class: "siem-index", text: `index=${ev.index}` }), input, go]);

  const fieldChips = el(
    "div",
    { class: "siem-fields", "aria-label": "Fields you can search on" },
    ev.fields.map((f) => {
      const b = el("button", { class: "siem-field", type: "button", text: f });
      b.addEventListener("click", () => insert(`${f}=`));
      return b;
    }),
  );
  const status = el("p", { class: "siem-status", role: "status" });
  const results = el("div", { class: "siem-results" });
  const body = el("div", { class: "siem" }, [bar, fieldChips, status, results]);

  const history: string[] = [];
  let back = 0;

  const insert = (text: string): void => {
    const at = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, at);
    const pad = before && !/\s$/.test(before) ? " " : "";
    input.value = before + pad + text + input.value.slice(input.selectionEnd ?? at);
    input.focus();
    const end = at + pad.length + text.length;
    input.setSelectionRange(end, end);
  };

  const show = (query: string, count: boolean): void => {
    let r;
    try {
      r = search(query, ev.events, ev.fields);
    } catch (e) {
      if (!(e instanceof SiemError)) throw e;
      status.className = "siem-status err";
      status.textContent = `Search error: ${e.message}`;
      results.replaceChildren();
      return;
    }
    status.className = "siem-status";
    const n = r.rows.length;
    status.textContent = `${n} ${r.stats ? (n === 1 ? "result" : "results") : n === 1 ? "event" : "events"}${n > SHOW ? `, showing the first ${SHOW}` : ""}`;
    const table = el("table", { class: "log siem-table" }, [
      el("thead", {}, [el("tr", {}, r.columns.map((c) => el("th", { text: c })))]),
      el("tbody", {}, r.rows.slice(0, SHOW).map((row) => el("tr", {}, r.columns.map((c) => el("td", { text: row[c] ?? "" }))))),
    ]);
    mount(results, el("div", { class: "log-scroll" }, [table]));
    if (count) body.dispatchEvent(new CustomEvent("tool-command", { bubbles: true, detail: { kind: "siem", evidence: ev.id, line: query } }));
  };

  const run = (): void => {
    const q = input.value.trim();
    if (q && history[history.length - 1] !== q) history.push(q);
    back = 0;
    show(q, true);
  };

  go.addEventListener("click", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && history.length) {
      e.preventDefault();
      back = Math.max(0, Math.min(history.length, back + (e.key === "ArrowUp" ? 1 : -1)));
      input.value = back ? history[history.length - back] : "";
    }
  });

  show("| tail 20", false);
  status.textContent = `${ev.events.length} events in ${ev.index}. The latest 20 are below. Search to narrow them down.`;
  return body;
}
