# Vendored Hallmark skill

Source: <https://github.com/nutlope/hallmark> at commit
`04977e15f3dfd6ee4b74c887dac3eb52665d6c92` (skill version 2.0.0, MIT; see
`LICENSE` in this folder).

Hallmark is the anti-AI-slop design skill from Together AI. This project keeps a
copy so `SKILL.md`, its gates and `scripts/sloplint.mjs` are available offline
and pinned to a known version.

## What was trimmed

`references/themes/*.jpg` (50 preview photographs, ~5.7 MB) were removed. The
theme material files (`references/themes/*.md`) are intact, so `theme.mjs` still
deals themes; it only omits the optional preview path. Everything else is
byte-for-byte upstream.

## How it applies here

NITRO WRAITH is a game overlay, not a landing page, so [DESIGN.md](../../../DESIGN.md)
at the repository root is the locked system: it overrides themes and records the
waivers. Read it before a Hallmark run.

## Updating

```sh
git clone --depth 1 https://github.com/nutlope/hallmark /tmp/hallmark
cp -R /tmp/hallmark/skills/hallmark/. .qoder/skills/hallmark/
rm .qoder/skills/hallmark/references/themes/*.jpg
```

Then bump the commit in this file and rerun `npm run check`.
