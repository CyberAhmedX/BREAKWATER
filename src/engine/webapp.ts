// A tiny simulated web server for the request editor, so a pentest hire can
// find a flaw by hand: edit a request, send it, read the reply. Everything is
// fictional and runs in the browser; nothing leaves it and no real site is
// involved. There are two apps. The booking app serves records by id without
// checking whether the record belongs to the signed-in session (OWASP: broken
// access control / IDOR). The login app is a lab copy of an old admin login
// with no lockout and no second factor, so guesses are free.

export interface HttpRequest {
  method: string;
  path: string; // e.g. /booking?id=1042
  headers: Record<string, string>;
  body: string;
}

export interface HttpResponse {
  status: number;
  reason: string;
  headers: Record<string, string>;
  body: string;
}

export class RequestError extends Error {}

/** One fictional booking app. The handler ignores who owns a record on purpose. */
export interface BookingApp {
  kind?: "booking";
  host: string;
  method: string; // the method the booking endpoint answers
  route: string; // the path, e.g. /booking
  param: string; // the query parameter that selects a record, e.g. id
  sessionCookie: string; // the value of the Cookie: session=... you start with
  yourId: string; // the one booking that session is actually allowed to see
  records: Record<string, Record<string, string>>; // id -> fields shown in the reply
}

/** A lab copy of an admin login. It never locks and never asks for a second factor. */
export interface LoginApp {
  kind: "login";
  host: string;
  route: string; // the path, e.g. /login
  user: string; // the one account that exists
  password: string; // the password that still works
  role: string; // what a successful sign-in gets, shown in the reply
}

export type WebApp = BookingApp | LoginApp;

/** What the editor remembers between sends, so a case can ask for more than one request. */
export interface WebSession {
  failures: number; // failed sign-ins so far (login app)
  proved: boolean;
}

export function newSession(): WebSession {
  return { failures: 0, proved: false };
}

/** How many wrong guesses show that the login never locks. */
export const LOCKOUT_PROOF = 3;

/** Parse a raw request (request line, headers, blank line, body). */
export function parseRequest(text: string): HttpRequest {
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blank = normalised.indexOf("\n\n");
  const head = blank === -1 ? normalised : normalised.slice(0, blank);
  const body = blank === -1 ? "" : normalised.slice(blank + 2);
  const lines = head.split("\n").filter((l, i) => i === 0 || l.trim() !== "");
  const first = lines[0]?.trim() ?? "";
  const m = /^([A-Z]+)\s+(\S+)(?:\s+HTTP\/[0-9.]+)?$/.exec(first);
  if (!m) throw new RequestError('the first line should look like: GET /booking?id=1041 HTTP/1.1');
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const c = line.indexOf(":");
    if (c === -1) throw new RequestError(`header "${line.trim()}" has no colon`);
    headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
  }
  return { method: m[1], path: m[2], headers, body };
}

function query(path: string): { pathname: string; params: Record<string, string> } {
  const q = path.indexOf("?");
  if (q === -1) return { pathname: path, params: {} };
  const params: Record<string, string> = {};
  for (const pair of path.slice(q + 1).split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    params[decodeURIComponent(k)] = eq === -1 ? "" : decodeURIComponent(pair.slice(eq + 1));
  }
  return { pathname: path.slice(0, q), params };
}

const respond = (status: number, reason: string, lines: string[]): HttpResponse => ({
  status,
  reason,
  headers: { "Content-Type": "application/json" },
  body: `{\n${lines.map((l) => `  ${l}`).join(",\n")}\n}`,
});

function form(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of body.trim().split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    try {
      out[decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq)).trim()] = eq === -1 ? "" : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " ")).trim();
    } catch {
      // a stray % is just a bad guess, not a crash
      out[(eq === -1 ? pair : pair.slice(0, eq)).trim()] = eq === -1 ? "" : pair.slice(eq + 1).trim();
    }
  }
  return out;
}

/** Was this a sign-in with the right account and password? */
function signsIn(app: LoginApp, req: HttpRequest): boolean {
  const { pathname } = query(req.path);
  const f = form(req.body);
  return pathname === app.route && req.method === "POST" && f.user === app.user && f.pass === app.password;
}

/** The login app. `failures` is how many wrong guesses came before this request. */
function serveLogin(app: LoginApp, req: HttpRequest, failures: number): HttpResponse {
  const { pathname } = query(req.path);
  if (pathname !== app.route) {
    return respond(404, "Not Found", [`"error": "no such page: ${pathname}"`, `"hint": "the sign-in is POST ${app.route} with user=...&pass=... in the body"`]);
  }
  if (req.method !== "POST") {
    return respond(405, "Method Not Allowed", [`"error": "${pathname} answers POST, not ${req.method}"`]);
  }
  const f = form(req.body);
  if (!f.user || f.pass === undefined || f.pass === "") {
    return respond(400, "Bad Request", [`"error": "send user=...&pass=... in the body, after a blank line"`]);
  }
  if (signsIn(app, req)) {
    return respond(200, "OK", [`"signed_in_as": ${JSON.stringify(app.user)}`, `"role": ${JSON.stringify(app.role)}`, `"second_factor_asked": false`, `"failed_attempts_before_this": ${failures}`]);
  }
  return respond(401, "Unauthorized", [`"error": "wrong user or password"`, `"failed_attempts": ${failures + 1}`, `"account_locked": false`]);
}

/**
 * Send one request in an editor session: the reply, with the session updated.
 * The booking app is proved by a 200 for a record that is not yours. The login
 * app is proved by showing it never locks (a few wrong guesses) and then
 * signing in.
 */
export function send(app: WebApp, req: HttpRequest, session: WebSession): HttpResponse {
  if (app.kind !== "login") {
    if (provedIdor(app, req)) session.proved = true;
    return serve(app, req);
  }
  const res = serveLogin(app, req, session.failures);
  if (res.status === 401) session.failures++;
  if (res.status === 200 && session.failures >= LOCKOUT_PROOF) session.proved = true;
  return res;
}

/** Serve one request against the booking app. The lookup never checks ownership. */
export function serve(app: BookingApp, req: HttpRequest): HttpResponse {
  const { pathname, params } = query(req.path);
  if (pathname !== app.route) {
    return respond(404, "Not Found", [`"error": "no such page: ${pathname}"`, `"hint": "the booking lookup is ${app.method} ${app.route}?${app.param}=..."`]);
  }
  if (req.method !== app.method) {
    return respond(405, "Method Not Allowed", [`"error": "${pathname} answers ${app.method}, not ${req.method}"`]);
  }
  const id = params[app.param];
  if (id === undefined || id === "") {
    return respond(400, "Bad Request", [`"error": "which booking? add ?${app.param}=<number>"`]);
  }
  const record = app.records[id];
  if (!record) {
    return respond(404, "Not Found", [`"error": "no booking ${id}"`]);
  }
  // The bug: the record is returned no matter whose session asked for it.
  const yours = id === app.yourId;
  const fields = Object.entries(record).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`);
  fields.push(`"served_to_session": ${JSON.stringify(sessionOf(req))}`);
  fields.push(`"belongs_to_this_session": ${yours}`);
  return respond(200, "OK", fields);
}

function sessionOf(req: HttpRequest): string {
  const cookie = req.headers["cookie"] ?? "";
  const m = /(?:^|;\s*)session=([^;]+)/.exec(cookie);
  return m ? m[1] : "(none)";
}

/** Did this response prove the access-control bug: a 200 for a booking that is not yours? */
export function provedIdor(app: BookingApp, req: HttpRequest): boolean {
  const res = serve(app, req);
  const { pathname, params } = query(req.path);
  return res.status === 200 && pathname === app.route && params[app.param] !== undefined && params[app.param] !== app.yourId && app.records[params[app.param]] !== undefined;
}
