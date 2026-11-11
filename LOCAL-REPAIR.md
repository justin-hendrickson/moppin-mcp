# Moppin MCP compatibility repair

This personal fork preserves the LanSynergy API compatibility work and additional repairs verified on November 11, 2026. It uses Mobbin website endpoints and does not depend on the official Mobbin MCP connector.

## Changes

- App/site catalogs use the current paginated discovery endpoints, with complete pagination, caching, deduplication and response validation.
- Autocomplete uses `/api/search-bar/fetch-suggestions`.
- Website sections retain signed CDN image URLs and account restriction flags.
- Explicit site ID/name lookups avoid a redundant catalog fetch.
- Screen and flow searches accept `app_name` for focused research.
- Restricted content is omitted, with an explicit notice for website sections.
- Runtime dependencies were updated and six regression tests were added.
- An optional macOS login dialog avoids terminal paste problems.

## Install this fork

Requires Node.js 24 or newer and a Mobbin account. No session data is included.

```sh
git clone https://github.com/justin-hendrickson/moppin-mcp.git
cd moppin-mcp
npm ci
npm test
npm run lint
MOBBIN_DATA_DIR="$HOME/.moppin-mcp" node dist/index.js auth
```

Alternatively, on macOS after building, use `python3 scripts/auth-dialog.py`. It opens a masked-input dialog. Follow its instructions; paste the copied browser session into the dialog, never into an issue or chat. The dialog defaults to `~/.moppin-mcp` and respects `MOBBIN_DATA_DIR` and `MOBBIN_AUTH_FILE`.

Register it locally with Codex:

```sh
codex mcp add moppin --env MOBBIN_DATA_DIR="$HOME/.moppin-mcp" -- node /absolute/path/to/moppin-mcp/dist/index.js
```

The original upstream README remains below the local notice for provenance; its upstream npm install commands do not install this fork.

## Verification and limits

Build, lint, and all 18 tests passed. Live checks returned Wise site search/autocomplete/sections, web app records, Revolut app autocomplete, Revolut screens, and its four-step “Sending a download link” flow. The README's `capture-site-sections` → `catalog` → `export` → `contact-sheet` workflow also passed, including image fetching and visual hashes.

Account entitlements still apply. In the verification account, Wise exposed three accessible sections and marked 118 restricted. Screen/flow discovery retains the upstream bounded scan of 12 candidate apps rather than an exhaustive natural-language search. Signed image URLs can expire. CI uses local fixtures, not private Mobbin credentials; rerun live checks after an upstream API change.

## Maintain the fork

```sh
git remote add upstream https://github.com/LanSynergy/mobbin-mcp.git
git fetch upstream
git switch -c justin/update-mobbin-upstream
git merge upstream/main
npm ci
npm test
npm run lint
```

Review conflicts and live behavior before merging updates. GitHub Actions runs the build, tests and lint on pushes and pull requests; it does not merge upstream changes or run a scheduled background sync. Keep sessions, generated reference libraries, and credentials outside Git.
