---
name: Editable UI content system
description: How the admin-editable page copy works and what is intentionally excluded
---

# Editable UI content

All user-facing static copy lives in `packages/content/ui-content.json` as a `pages[]` schema
(each page: key/title/description + fields of key/label/value/multiline). Components read copy
through `useContent()` from `apps/web/src/content.ts` (zustand store overlays server overrides onto
the bundled defaults). The admin "Page content" editor saves via token-authed `PUT /api/content`;
the server persists overrides to `apps/server/data/ui-content.json` and merges them onto defaults.

**Why a sparse draft in the editor:** `ContentEditor` keeps only edited fields in local state and
falls back to the live store value for untouched ones, so a background `refresh()` never clobbers
edits or shows stale values. Draft is cleared after a successful save.

**Intentionally NOT editable:**
- `QuizResults` (the solo, non-team results screen) in `apps/web/src/QuizApp.tsx` is unreachable
  dead code — `PlayerApp` always renders `QuizApp` with a `team` prop, so its branch never shows.
  Its strings are deliberately left hardcoded.
- `"Your team"` default team name is a runtime data default (also defaulted server-side), not page
  chrome.

**Gotcha:** the server loads `ui-content.json` at boot via `require.resolve`. After editing the
defaults JSON (adding/removing fields), restart the workflow so the server picks up the new schema
and `validFieldKeys` allowlist.
