# FluidPath Studio 1.27.1 Handoff

## 2026-10-02 local bugfix update — DRAFT / not published

The **first batch of six bugfixes** requested after the visual/interaction review is complete in the local `main` working copy. The user then explicitly changed the delivery scope to **local code + this handoff only**. Do not push to GitHub, trigger Pages, or claim a new release without a later request. Application version remains `1.27.1` (no release/DMG build in this update).

Local code commit: `b5d8e45` (`fix: validate reconnects and separate flow display states`). The current handoff update is a separate local documentation change. Existing untracked `outputs/` remains untouched and uncommitted.

### What changed / 本次修复

1. **Animation performance:** Removed engine recomputation and recursive per-pipe flow checks from each animation frame. Flowing pipe IDs are recomputed when the diagram's nodes/pipes change; UI-only redraws and animation frames read cached results.
2. **Connection integrity:** New connections and endpoint reconnections share checks for missing/same/same-node ports, two inlets/two outlets, and occupied ports. A reconnection previews valid/invalid targets and commits only on mouse release; an invalid drop keeps the old connection. Non-edit modes cannot rewire endpoints.
3. **Fault-code focus:** “Locate linked range” now scales small targets up to a readable view (max 180%) instead of only zooming out; large ranges obey the canvas minimum of 20%.
4. **Paused flow visuals:** Global pause and individual pipe animation-off hide the white particle path. Medium color and direction remain visible, while the status bar states that engineering flow still follows the operating condition.
5. **Teaching override clarity:** Forced flow/stop controls moved to a separate collapsed “Teaching display override” section with a warning that they do not change engineering validation. Controls are disabled in verification/fault modes; light/dark warning colors and English labels are included.
6. **Engineering vs. display separation:** The existing `disabled` (engineering) / `displayDisabled` (canvas-only) split was retained, not replaced. Tooltips and flow-state labels were clarified; regression tests confirm that canvas dimming and teaching stop do not alter engineering flow or validation. **No schema migration or new product feature was added.**

### Verification / 验证基线（2026-10-02）

- `npm run check`: **58 test files passed, 2 skipped; 390 tests passed, 4 skipped** (includes seven new regression tests).
- `npm run build`: passed; production JS approximately 638 kB (existing >500 kB advisory persists).
- `node scripts/check-diagram.mjs BCMTS.json --cases all`: **1/1 case PASS, 5 assertions**. This case only asserts stop-flow, so its existing `NO_POSITIVE_FLOW_ASSERTION` caution still applies.
- `npm run smoke`: passed in hidden Electron window; app/canvas/fault mode loaded, four English mode labels fully visible at 512 px, no console errors.
- `git diff --cached --check` before the code commit: passed. No user data under `outputs/` was staged.

### GitHub state / 后续接手须知

- **No GitHub push was performed for this bugfix.** The last locally known `origin/main` is `d56b06d`; the fresh remote state was **not verified** because direct HTTPS fetch failed (HTTP/2 framing error; HTTP/1.1 retry timed out). This local tracking ref must not be treated as a fresh remote confirmation.
- Earlier local documentation commits `e92c98d` and `c0a22e1`, plus code commit `b5d8e45` and this handoff update, are local-only. If publication is requested later, first check the real remote head and integrate safely; do not force-push. Historical proxy guidance below is retained for that later task only.
- No version bump, GitHub Pages deployment, or desktop release artifact was made for this update. Pre-existing Vite deprecation/bundle-size warnings and four skipped tests remain outside this first-batch scope.

## Historical status (1.27.1 publication on 2026-09-29): PUBLISHED ✅

The FluidPath Studio 1.27.1 changes were published to GitHub on 2026-09-29 and the GitHub Pages deployment was verified. This document records the final state for the next session.

## Source of truth

- Repository: `https://github.com/leowu65516-crypto/fluidpath-studio.git`
- Local repository: `/Users/leo/Documents/Fluidpath studio`
- Branch: `main`
- Application version: `1.27.1`

## Publication result

- Remote `origin/main` after publication: `d56b06dd1d7be4124111067584c039ea0523041a` (`fix: keep localized work mode controls visible`)
- Pushed commits (in order): `127c38d` (fault troubleshooting mode), `4e16fd2` (validation semantics), `d56b06d` (toolbar localization fix)
- Local HEAD **at that publication handoff**: `e92c98d` (`docs: add publication handoff`) — one local commit ahead of remote at the time, not pushed
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

- The current local changes described at the top, including this handoff update, are intentionally not pushed per the latest user instruction. Recheck remote state and obtain a new publishing request before any future push.
- If a new DMG is built, verify the mounted app version before publication. Do not commit generated build artifacts unless the repository policy explicitly changes.

## Build commands

```sh
npm ci
npm run check
npm run smoke
npm run smoke:multiwindow
npm run dist:dir
npm run verify:asar
```
