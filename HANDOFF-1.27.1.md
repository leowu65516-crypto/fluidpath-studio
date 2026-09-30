# FluidPath Studio 1.27.1 Handoff

## Status: PUBLISHED ✅

The FluidPath Studio 1.27.1 changes were published to GitHub on 2026-09-29 and the GitHub Pages deployment was verified. This document records the final state for the next session.

## Source of truth

- Repository: `https://github.com/leowu65516-crypto/fluidpath-studio.git`
- Local repository: `/Users/leo/Documents/Fluidpath studio`
- Branch: `main`
- Application version: `1.27.1`

## Publication result

- Remote `origin/main` after publication: `d56b06dd1d7be4124111067584c039ea0523041a` (`fix: keep localized work mode controls visible`)
- Pushed commits (in order): `127c38d` (fault troubleshooting mode), `4e16fd2` (validation semantics), `d56b06d` (toolbar localization fix)
- Local HEAD: `e92c98d` (`docs: add publication handoff`) — one local commit ahead of remote, not pushed
- Untracked `outputs/` directory: left untouched, belongs to the user, not uploaded
- `release/` artifacts (DMG etc.): gitignored, not committed

## Verification results (completed 2026-09-29)

- GitHub Actions `Check (TypeScript + Tests)`: Run 15 — **success**
- GitHub Actions `Deploy to GitHub Pages`: Run 26 — **success**
- Deployed bundle version constant: `1.27.1` ✅
- English toolbar at narrow width: `✏️ Edit`, `🎬 Demo`, `✓ Verify`, `⚠ Fault` all fully visible, not truncated ✅
- Local suite (before publication): 57 test files, 383 passing, 4 intentionally skipped; narrow-English toolbar smoke passed

## Network and credential facts

Direct terminal access to GitHub times out because macOS uses a local proxy that Git does not automatically inherit:

```text
http://127.0.0.1:10808
```

Use the proxy only for the Git operation:

```sh
git -c http.proxy=http://127.0.0.1:10808 ls-remote origin refs/heads/main
git -c http.proxy=http://127.0.0.1:10808 push origin main
```

Credential state:

- Fine-grained PAT `fluidpath-push-1271b` (scoped to `fluidpath-studio` only; permissions: `Contents: Read and write` + `Workflows: Read and write`; expires 2026-10-29) is stored in the macOS Keychain via git's `osxkeychain` helper, so pushes reuse it without prompting.
- Note: the `Workflows` permission is required because some commits modify `.github/workflows/check.yml`; a Contents-only token is rejected by GitHub.
- All other tokens (`fluidpath-publish-1.27.1`, `fluidpath-push-1271`) have been deleted.
- The classic PAT was rejected by GitHub and must never be retried or retained. Never put a token into source files, Git remote URLs, commits, Markdown files, build output, or chat.

## Delivered changes

- P0/P1 reliability work: i18n completion, report export, CI, scenario/document alignment, acceptance-result semantics, state separation, AI edit safety boundaries, and validation-oriented documentation.
- Work-mode toolbar localization fix: English `Edit`, `Demo`, `Verify`, and `Fault` controls remain visible and untruncated at a narrow width.
- Packaged desktop application: `release/FluidPath Studio-1.27.1-arm64.dmg` (about 117 MB).

## Open items for a future session

- The local commit `e92c98d` (this handoff document) is intentionally not pushed; push it only if the repository policy wants handoff docs in history.
- If a new DMG is built, verify the mounted app version before publication. Do not commit generated build artifacts unless the repository policy explicitly changes.

## Build commands

```sh
npm ci
npm run check
npm run smoke
npm run smoke:multiwindow
npm run package
npm run verify:asar
```
