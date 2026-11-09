import type { RequestEvidence } from "../engine/types";
import { parseRequest, send as sendRequest, newSession, RequestError, type WebSession } from "../engine/webapp";
import { el } from "./dom";

// The request editor: a raw request you can edit, a Send button, and the reply
// from the fictional app. Like a stripped-down Burp Repeater. It remembers
// whether you have proved the flaw (a booking that is not yours, or a login
// that never locks and then lets you in), for the question to check.
//
// Each send fires a "tool-command" event, so the case can count them.

const sessions = new WeakMap<HTMLElement, WebSession>();

/** Has the flaw been proved in this editor yet? */
export function requestProvedOf(view: HTMLElement): boolean {
  const body = view.matches(".req") ? view : view.querySelector<HTMLElement>(".req");
  return body ? (sessions.get(body)?.proved ?? false) : false;
}

export function requestView(ev: RequestEvidence): HTMLElement {
  const editor = el("textarea", {
    class: "req-input",
    rows: Math.max(4, ev.request.split("\n").length + 1),
    spellcheck: "false",
    autocapitalize: "off",
    autocomplete: "off",
    "aria-label": `Request to ${ev.app.host}`,
  }) as HTMLTextAreaElement;
  editor.value = ev.request;
  const send = el("button", { class: "btn primary small", type: "button", text: "Send" });
  const reset = el("button", { class: "btn ghost small", type: "button", text: "Reset request" });
  const status = el("p", { class: "req-status", role: "status" });
  const response = el("pre", { class: "req-response", "aria-label": "Response" });
  const body = el("div", { class: "req" }, [
    el("p", { class: "req-target", text: `Target: ${ev.app.host} (${ev.app.kind === "login" ? "a lab copy, yours to test" : "a test site, in scope"}). Edit the request and send it.` }),
    editor,
    el("div", { class: "btn-row" }, [send, reset]),
    status,
    response,
  ]);
  const session = newSession();
  sessions.set(body, session);

  const run = (): void => {
    let req;
    try {
      req = parseRequest(editor.value);
    } catch (e) {
      if (!(e instanceof RequestError)) throw e;
      status.className = "req-status err";
      status.textContent = `Could not send: ${e.message}`;
      response.textContent = "";
      return;
    }
    const res = sendRequest(ev.app, req, session);
    const ok = res.status >= 200 && res.status < 300;
    status.className = ok ? "req-status good" : "req-status";
    status.textContent = `HTTP ${res.status} ${res.reason}`;
    const headers = Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`).join("\n");
    response.textContent = `HTTP/1.1 ${res.status} ${res.reason}\n${headers}\n\n${res.body}`;
    body.dispatchEvent(new CustomEvent("tool-command", { bubbles: true, detail: { kind: "request", evidence: ev.id, line: req.path } }));
  };

  send.addEventListener("click", run);
  reset.addEventListener("click", () => {
    editor.value = ev.request;
    status.textContent = "";
    response.textContent = "";
  });
  return body;
}
