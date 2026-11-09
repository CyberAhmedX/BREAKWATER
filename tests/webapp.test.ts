import { describe, it, expect } from "vitest";
import { parseRequest, serve, send, newSession, provedIdor, LOCKOUT_PROOF, RequestError, type BookingApp, type LoginApp } from "../src/engine/webapp";

const app: BookingApp = {
  host: "booking.harbor-halden.example",
  method: "GET",
  route: "/booking",
  param: "id",
  sessionCookie: "guest-7f3a",
  yourId: "1041",
  records: {
    "1041": { name: "Your test booking", slot: "Tue 18:00", contact: "you@example" },
    "1042": { name: "M. Okonkwo", slot: "Tue 19:00", contact: "m.okonkwo@brightloaf.example" },
  },
};
const base = "GET /booking?id=1041 HTTP/1.1\nHost: booking.harbor-halden.example\nCookie: session=guest-7f3a";

describe("request parsing", () => {
  it("reads the method, path, headers and body", () => {
    const r = parseRequest("POST /x?a=1 HTTP/1.1\nHost: h\nContent-Type: text/plain\n\nhello");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/x?a=1");
    expect(r.headers.host).toBe("h");
    expect(r.body).toBe("hello");
  });
  it("accepts a request with no version and no body", () => {
    expect(parseRequest("GET /booking?id=1041\nHost: h").method).toBe("GET");
  });
  it("explains a malformed request", () => {
    expect(() => parseRequest("nonsense")).toThrow(RequestError);
    expect(() => parseRequest("GET /x\nbadheader")).toThrow(/colon/);
  });
});

describe("the booking app", () => {
  const send = (text: string) => serve(app, parseRequest(text));
  it("returns your own booking", () => {
    const res = send(base);
    expect(res.status).toBe(200);
    expect(res.body).toContain('"belongs_to_this_session": true');
  });
  it("hands over someone else's booking without an auth check (the bug)", () => {
    const res = send(base.replace("id=1041", "id=1042"));
    expect(res.status).toBe(200);
    expect(res.body).toContain("M. Okonkwo");
    expect(res.body).toContain('"belongs_to_this_session": false');
    expect(res.body).toContain("guest-7f3a");
  });
  it("404s an unknown booking, the wrong path, and 405s the wrong method, 400 with no id", () => {
    expect(send(base.replace("id=1041", "id=9999")).status).toBe(404);
    expect(send(base.replace("/booking", "/nope")).status).toBe(404);
    expect(send(base.replace("GET", "DELETE")).status).toBe(405);
    expect(send(base.replace("?id=1041", "")).status).toBe(400);
  });
  it("provedIdor is true only for a 200 on a booking that is not yours", () => {
    expect(provedIdor(app, parseRequest(base))).toBe(false);
    expect(provedIdor(app, parseRequest(base.replace("id=1041", "id=1042")))).toBe(true);
    expect(provedIdor(app, parseRequest(base.replace("id=1041", "id=9999")))).toBe(false);
  });
});

describe("the lab login", () => {
  const login: LoginApp = { kind: "login", host: "harborwatch-lab.test", route: "/login", user: "hw-admin", password: "Harbor!Watch2021", role: "full admin" };
  const post = (pass: string): ReturnType<typeof parseRequest> => parseRequest(`POST /login HTTP/1.1\nHost: harborwatch-lab.test\n\nuser=hw-admin&pass=${pass}`);

  it("counts wrong guesses and never locks", () => {
    const session = newSession();
    for (let i = 1; i <= 6; i++) {
      const res = send(login, post(`guess${i}`), session);
      expect(res.status).toBe(401);
      expect(res.body).toContain(`"failed_attempts": ${i}`);
      expect(res.body).toContain('"account_locked": false');
    }
    expect(session.proved).toBe(false);
  });

  it("is proved only by free guesses and then the real password", () => {
    const early = newSession();
    expect(send(login, post("Harbor!Watch2021"), early).status).toBe(200);
    expect(early.proved, "signing in alone does not show there is no lockout").toBe(false);

    const session = newSession();
    for (let i = 0; i < LOCKOUT_PROOF; i++) send(login, post("nope"), session);
    const res = send(login, post("Harbor!Watch2021"), session);
    expect(res.status).toBe(200);
    expect(res.body).toContain('"second_factor_asked": false');
    expect(session.proved).toBe(true);
  });

  it("explains a wrong method, a wrong page and a missing body", () => {
    const session = newSession();
    expect(send(login, parseRequest("GET /login HTTP/1.1\nHost: h"), session).status).toBe(405);
    expect(send(login, parseRequest("POST /admin HTTP/1.1\nHost: h\n\nuser=a&pass=b"), session).status).toBe(404);
    expect(send(login, parseRequest("POST /login HTTP/1.1\nHost: h"), session).status).toBe(400);
    expect(session.failures).toBe(0);
  });

  it("does not crash on a badly encoded guess", () => {
    const session = newSession();
    expect(send(login, post("100%zz"), session).status).toBe(401);
  });

  it("the booking app still proves through a session", () => {
    const session = newSession();
    send(app, parseRequest(base), session);
    expect(session.proved).toBe(false);
    send(app, parseRequest(base.replace("id=1041", "id=1042")), session);
    expect(session.proved).toBe(true);
  });
});
