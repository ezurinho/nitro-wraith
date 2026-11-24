# Security policy

NITRO WRAITH runs inside an authenticated Nitro Type session, so a bug here can
expose more than a normal userscript. Reports are welcome and read carefully.

## Supported versions

Only the latest stable release is supported. Canary builds are test builds: fixes
land on the stable channel, not on an old canary tag.

## Report a vulnerability

Use GitHub's private reporting: open the **Security** tab of
[ezurinho/nitro-wraith](https://github.com/ezurinho/nitro-wraith) and choose
**Report a vulnerability**. That opens a private advisory visible only to the
maintainer.

Do not open a public issue for anything that could leak a session. If private
reporting is unavailable, open an issue that says only "security report, please
contact me" and nothing else. Never paste a `player_token`, cookies, account
e-mail or a full diagnostic report into a public thread; the panel's report
already redacts the token, but treat it as account data anyway.

Include, when possible:

- the installed version (panel footer or `@version`) and channel (stable or canary);
- the browser and userscript manager;
- what an attacker could read or change, and the smallest steps that show it;
- whether the request left the site and to which host.

## In scope

- Reading or sending the session token, cookies or account data anywhere except
  Nitro Type's own same-origin API.
- Script injection through data the panel renders (history rows, account names,
  race text, imported config).
- Update-check weaknesses: accepting a build from a host other than the release
  CDN or the Gist mirror, or installing anything without a user click.
- Build or release supply-chain issues (the published userscript must match `src/`).

## Out of scope

- Nitro Type's anti-cheat, account bans or the site's own vulnerabilities.
- Tampermonkey, the browser or the OS.
- Anything that requires editing the installed userscript by hand.

## What the script already guarantees

- No telemetry, analytics or third-party logging.
- Credentials and CAPTCHAs are never typed or solved; they stay manual.
- The only off-site requests are the public update checks, made without credentials.
- The update check opens a download in a new tab; it never installs a build by itself.
