# Stable rollback and hotfix

The canary channel can be rolled back by rebuilding an old canary tag. The
stable channel cannot: Tampermonkey compares versions and will not install a
lower one. A stable rollback is therefore a **new, higher version built from the
last known good source**, published through the normal release path.

## When to use this

- A stable release breaks the panel, the queue or typing for most users.
- The Gist and the release asset disagree.
- A release asset is missing or corrupted.

Do not use it to hide a single account-specific failure: read the diagnostic
report and the support bundle first.

## 1. Identify the last good tag

```bash
git fetch origin --tags
git tag --sort=-v:refname | head
```

Use a stable tag such as `v8.14.52`, not a canary tag. The stable tags are the
ones that match `vX.Y.Z`.

## 2. Plan the hotfix

```bash
node tools/release.js hotfix-plan --from v8.14.52
```

The plan prints:

- the source commit;
- the source version;
- the current (bad) version;
- the next version (`current + 1`);
- the exact steps and the no-downgrade rule.

The next version must be higher than the bad stable. Never republish the bad
version and never publish a lower one.

## 3. Build and verify locally

```bash
node tools/release.js hotfix-build --from v8.14.52 --out dist/hotfix
node tools/release.js verify --local dist/hotfix
```

`hotfix-build` creates a temporary worktree at the source commit, sets the new
version in `src/00-header.js`, `src/10-config.js`, `package.json` and
`README.md`, rebuilds, and copies the two installable assets plus `build.json`
and `SHA256SUMS` into `dist/hotfix`. It does **not** publish or commit.

The generated `dist/hotfix/build.json` records the source commit in `commit`,
the old version in `sourceVersion`, and `channel: "stable-hotfix"`. The release
published through the normal workflow records the restored commit; keep the
`HOTFIX.md` and the PR description as the audit trail for the source version.

## 4. Publish through the normal path

The release workflow publishes the version that is in `package.json` when the
tag does not exist yet. To restore the old source with the new version:

1. Create a branch from the bad release commit (or from `main`).
2. Restore the source and generated files from the good tag:
   ```bash
   git checkout v8.14.52 -- src nitro-wraith.user.js nitro-wraith.meta.js package.json README.md CHANGELOG.md
   ```
3. Set the new version in the four version places:
   - `src/00-header.js` (`// @version`);
   - `src/10-config.js` (`const VERSION`);
   - `package.json` (`version`);
   - `README.md` (the badge and the `releases/tag/...` link).

   Then rebuild and verify the local bundle:
   ```bash
   node tools/build.js
   node tools/release.js bundle
   node tools/release.js verify --local dist/release
   ```
   Do not copy `dist/hotfix` over `src/`: those assets contain the new version
   but the source markers would still be old and `build:check` would fail.
4. Add a CHANGELOG entry, run the full check, and open a PR:
   ```bash
   npm run check
   ```
5. Merge to `main`. The `check` workflow must pass; the `release` workflow then
   publishes the version from `package.json`, updates the Gist, and verifies the
   assets.

If the bad release is still `latest`, publish the hotfix first and only then
edit the old release notes to add a warning. Do not delete the old assets: they
are useful for forensics and for users who need to identify what they had.

## 5. Verify the published release

```bash
npm run release:verify -- v8.14.54
```

The verifier checks:

- `build.json` version, channel and commit;
- `SHA256SUMS` against the downloaded assets;
- the stable Gist userscript hash against the release asset;
- the Gist metadata version against the release version.

`--wait` retries for about a minute, which is useful immediately after a
publish:

```bash
npm run release:verify -- v8.14.54 --wait
```

## Canary rollback

The canary alias is a pre-release and can be rolled back without a new stable
version:

1. Actions → **canary** → Run workflow.
2. Set `ref` to an earlier `canary-<version>` tag.
3. The workflow rebuilds that commit with a new build number, republishes the
   `canary` alias, and leaves the stable Gist, tags and `releases/latest`
   untouched.

The immutable `canary-<version>` tag is skipped when the old tree changes
`.github/workflows`, because the Actions token cannot create such a ref. The
release's `build.json` still records the exact commit, source ref and run.

## Drill

A safe drill does not publish:

```bash
node tools/release.js hotfix-plan --from v8.14.52
node tools/release.js hotfix-build --from v8.14.52 --out dist/hotfix-drill
node tools/release.js verify --local dist/hotfix-drill
```

Delete `dist/hotfix-drill` afterwards. The worktree is removed automatically; if
a run is interrupted, `git worktree prune` cleans the metadata.
