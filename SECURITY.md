# Security Policy

Breakwater is a single, self-contained HTML game that runs entirely in your
browser. It has no server, no accounts, and no network calls, and it stores
save data only in your own browser's local storage. The attack surface is
small, but reports are welcome.

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

- Preferred: GitHub's private vulnerability reporting, under this repository's
  **Security** tab, "Report a vulnerability".
- Or email: ahmedsajid_bw@proton.me

Please include what you found, how to reproduce it, and the impact. I aim to
acknowledge within a few days.

## Scope

In scope: anything in this repository that could harm a player, for example
code that could run from a crafted save file or an imported save code.

Out of scope: the fictional scenarios, addresses, accounts, and
"vulnerabilities" inside the game's cases. Those are invented teaching content
and are intentionally insecure by design. All addresses use documentation
ranges and all domains use reserved TLDs; none point at a real system.

## Supported versions

The latest release and the current `main` branch are supported. Older tagged
releases are not patched.
