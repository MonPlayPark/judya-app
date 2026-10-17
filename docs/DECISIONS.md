# JudYa — decision log

Decisions Q1–Q12 are in `docs/BRIEF.md` section 7 and are not repeated here. This file records
decisions taken **while building**, and questions the BRIEF does not answer. Newest step last.

## Step 3.1

### Open questions (BRIEF is silent — need an answer before the step that uses them)

| # | Question | Needed by | What was done meanwhile |
|---|---|---|---|
| O2 | Default text of `settings.orderTemplate` (variables `{ร้าน}` `{รายการ}`). BRIEF gives defaults for the three numbers only. | 3.3 | Default is an empty string. `buildOrderMessage` already appends the list when `{รายการ}` is missing, so an empty template still works. |
| O3 | Wording of the "page not found" screen for an unknown `#/...` route. | any time (low) | Shows the title "ไม่พบหน้านี้". |

### Decisions taken (no BRIEF rule existed; easy to change)

- **Versions** (latest at the time): React 18.3 (BRIEF says 18), Vite 8, TypeScript 7 strict
  (plus `noUncheckedIndexedAccess`, `noUnusedLocals`), Vitest 5 + jsdom + Testing Library, zod 4,
  vite-plugin-pwa 2. Node 22 in CI.
- **Base path** `/judya-app/` (repo name confirmed from the git remote; BRIEF 3.5 asked to confirm).
  Live URL: `https://monplaypark.github.io/judya-app/`.
- **Router**: hand-written hash router (`src/router.ts`, ~40 lines), not `react-router`.
- **`calc.ts`** is the reference code with types added and the same numbers. Things kept only because the
  18 reference tests need them, and replaced later per BRIEF section 4:
  - `compareShops` / `lineCost` (old `pharmacies` shape) → rewritten in 3.3 against the new `Shop` / `Price` model.
  - `EXPIRY_WARN_DAYS = 30` → becomes `settings.expiryWarnDays` (default 15) in 3.2.
  - `allergyHits` → kept, but the allergy button is hidden (Q12), no screen uses it yet.
  - Test ids were renamed to neutral `itemA` / `itemB`; no medicine names in tests.
- **Storage** (`storage.ts`): `loadRoot` never writes. Corrupt data or another data version is returned as such
  and left untouched; the UI (3.2) must offer the person a choice before anything is replaced.
  `saveRoot` = validate → write → read back → validate; on any failure the previous value is restored.
  `judya.v2.prev` (restore-from-backup safety copy, BRIEF 3.3) is **not** implemented — it belongs to step 3.2d.
- **Schema**: `birthYearBE` is accepted as any 4-digit number; the 2400..current-year rule is the `validate*`
  function of step 3.2. Dates use `z.iso.date()`, timestamps `z.iso.datetime({ offset: true })`.
- **Icons**: rendered from `assets/Logos/judya-appicon.svg` of Design System v2 (unmodified).
  `any` icons use the full tile; the maskable icon is the same art at 80% on a full `#006DF5` square.
  Manifest `theme_color` is `#1A73E8` as BRIEF 3.4 says (the icon tile itself is `#006DF5`).
- **Fonts**: `@fontsource/noto-sans-thai` per-weight CSS (400/500/600/700). Do not switch to the `thai-*.css`
  / `latin-*.css` files: they have no `unicode-range` and the Latin face can shadow Thai letters.
  Only `.woff2` files are precached.
- **Updates**: `registerType: 'prompt'`. A bar "มีเวอร์ชันใหม่ · โหลดใหม่" appears; the page reloads only when tapped.
- **CI**: pull requests run test + build; deploy runs only on `main` after both pass. Actions pinned to major versions.

## Step 3.2a-1

### Decided by the owner

| # | Question | Answer (17 ต.ค. 2569) |
|---|---|---|
| O1 | What fields does `Snapshot` (`from` / `to` of an event) contain? | Defined in BRIEF section 2. `Snapshot = { schedule?, name?, stockQty?, expiry?, note? }`, all optional, unknown keys rejected. `start`: `to={schedule}` only, no `from`. `adjust`: `from={schedule}`, `to={schedule}`, the two must differ. `edit`: `from`/`to` have the same keys, only changed fields, at least 1 field, each value must differ. `stop`/`resume`: no `from`/`to`. Implemented in `schema.ts` (`snapshotSchema`, `medEventSchema`) with tests. |
