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

### Open questions (need an answer before the step named)

| # | Question | Needed by | What was done meanwhile |
|---|---|---|---|
| O4 | `stockNow` uses the **current** schedule for every day since `countedOn`. If a dose is adjusted (event `adjust`) after the count, the days before the adjustment are recomputed with the new dose, so the number is wrong. Options: (a) the adjust screen also asks for a new count (sets `countedOn` = adjust date), (b) the walk uses the schedule from the events history. This changes medicine numbers. | 3.2b (adjust-dose screen) | Nothing writes `adjust` yet. `stockNow` is correct as long as the schedule has not changed since the count. |
| O5 | Sample data lives in the same house as real data: `meta.isSample` is one flag for the whole house. When the owner adds a real member or medicine on top of the sample, "ลบข้อมูลตัวอย่าง" would delete the real data too. | 3.2b / 3.2c (first screen that adds data) | `loadSample` only runs on a blank house and `clearSample` only on a house flagged `isSample`. Every add/edit action written later **must clear `meta.isSample`** (or the screen must ask first). |

### Decisions taken (no BRIEF rule existed; easy to change)

- **`meta.isSample`** (optional boolean in `meta`): marks the whole house as the made-up sample set, so "delete sample" can remove
  everything in one step and can never run on real data. Chosen over a per-record flag because the sample is loaded only into a
  blank house (simplest). See O5 for the risk.
- **Sample set** (`domain/sample.ts`): members "สมาชิกตัวอย่าง ก/ข" (ข manages their own medicine), medicines "ยาตัวอย่าง ก/ข/ค/ง"
  (ก daily morning+evening, ข Mon/Wed/Fri, ค every 12 h for a 5-day course starting today, ง belongs to ข = self-managed),
  house medicines "ยาสามัญตัวอย่าง ก" (expires in 10 days = soon with the default 15) and "ข" (expires in 400 days).
  Dates follow today; stock counts are made up. `createdAt` uses the current time (`toISOString()`, ends with `Z`).
- **Stock walk** (`stock.ts`) replaces the old `stockWalk` for new code (old one is kept for its 18 tests). `daysLeft` returns
  `unknown` (no count / stopped), `ok {days, depletionDate}` (days from today to the first day that cannot be covered) or
  `enough` (a short course ends before the stock does, or more than 3650 days).
- **Stop / resume** (BRIEF "ช่วงที่หยุดยาไม่หัก"): `stockNow` / `daysLeft` / `isLowStock` take an optional `events` list; a `stop`
  event pauses deduction from its `effectiveOn` day (inclusive) until the next `resume` day (inclusive = deducting again).
  Without events nothing is paused.
- **Interval doses per day** = `24 / everyHours × pills` on every day of the course (`startDate` .. `startDate + days − 1`),
  whatever `firstTime` is. A late first dose on day 1 is not treated as a partial day.
- **`todayDoses`** returns a flat list already sorted (morning, noon, evening, bedtime; inside a slot before / with / after meal;
  interval doses last by clock time). Each item says its slot or time and meal timing, so the screen groups it (3.2a-2).
  Interval keys are `<assignmentId>:<HH:MM>`; times are `firstTime` + N hours, wrapping past midnight.
- **`expiryStatus`** got an optional third argument `warnDays`; the default 30 stays only so the 18 old tests pass. New code always
  passes `settings.expiryWarnDays`.
- **Load problems**: "ลองอีกครั้ง" loads again. "เริ่มใหม่" (not shown for `unavailable`: there is nothing to start over from when the
  browser blocks storage) asks for confirmation, copies the current text of `judya.v2` to `judya.v2.prev`, and only then writes a
  blank house; if either step fails the old text stays in `judya.v2`. An older `judya.v2.prev` is overwritten.
- **First launch** writes nothing: the blank house is held in memory until the first change is saved.
- **Failed save**: the screen keeps the old data (the change is not shown), a red bar says "บันทึกไม่ได้ ข้อมูลเดิมยังอยู่" with a
  retry button that re-applies the same change on the current data.
- **`navigator.storage.persist()`**: asked once per page load, skipped when already granted (BRIEF 3.2 also wants it after the first
  saved medicine, and a status in Settings — both later). No screen shows the result yet.
- **Home tab (temporary)**: the count "ยา M รายการ" is the number of medicines of members (assignments); house medicines are not
  counted in that sentence. Real home screen: 3.2a-2.
- **Tests**: no new libraries (no `user-event`); screen tests use `fireEvent`. `helpers.test-util.ts` holds test builders only.

## Step 3.2a-2

### Decided by the owner (18 ต.ค. 2569 "ตามที่แนะนำ")
1. The bell button is hidden (a web app cannot warn while closed; in M3 warnings are seen only when the app is open).
2. "ยาที่ต้องดูแล" includes members' medicines that are expired / expiring (with the owner's name), not only house medicines.
3. The home "ยาวันนี้" card shows the first 3 doses **not yet prepared**. All prepared = "จัดครบแล้ว"; nothing today = "วันนี้ไม่มียาที่ต้องจัด".

### Hidden because the page is not built yet (Q12) — show them when the page exists
- Home: add-medicine button (3.2b), order button "สั่งยา N รายการ" (3.3), "เปลี่ยนเกณฑ์" link (Settings, 3.2d), members "ดูทั้งหมด" link (3.2c).
- Home: member cards and care rows are not tappable (member page 3.2c, medicine/house pages 3.2b / 3.3).
- Top bell (owner decision 1; stays hidden for good unless the owner changes it).

### Decisions taken (BRIEF / board silent; easy to change)
- **Care list** (`domain/care.ts`): a medicine that is both low on stock and expiring appears in both groups, but the total count counts it once.
  Stock group order: members first (fewest days left first), then house medicines (smallest quantity first), because days and units cannot be compared.
  Member stock line shows the quantity at the start of today ("มี N เม็ด"); the order text of the board ("สั่ง 60 เม็ด") is not shown (no ordering yet).
- **Self-managed member with low stock** still shows "ใกล้หมด" on the member card (a warning is never hidden); otherwise it says "จัดยาเอง · เราดูแลสต๊อก".
- **Member card statuses**: ใกล้หมด / สต๊อกพอ / จัดยาเอง · เราดูแลสต๊อก / ยังไม่ใส่ยา (no active medicine) / ยังไม่ใส่จำนวนยา (no medicine has a stock count).
  If only some medicines have a count and none is low, it says "สต๊อกพอ" (only counted ones are judged).
  Gray member colour uses `--color-background` with a border (no gray tint token exists).
- **Interval medicine, no end ("ongoing")**: no "วันที่ X จาก Y" line (there is no start date in the data to count from).
- **Section title** for every-X-hours medicines is "ยาที่กินทุก ๆ ชั่วโมง" (the board's literal "X" looks like a placeholder).
- **Home preview row label** for an interval dose is its clock time (e.g. 08:00), not "เช้า".
- **Progress** on the today screen is always for everyone; the member filter only narrows the list. Filter chips exist only for members with doses today; an unknown `?who=` shows everyone.
- **Note "ไม่รวม … เพราะจัดยาเอง"** (from the board) lists self-managed members who have at least one active medicine.
- **Clock**: `DataProvider` / `App` take an optional `getToday` (tests only). Screens re-read today on visibility change, focus and every 60 s.
  A tap made after midnight but before the screen noticed is dropped (the screen refreshes), so a tick never lands on the wrong day.
- **Avatar initial**: first letter of the name, skipping Thai leading vowels (เ แ โ ใ ไ).

## Step 3.2a-3 (18 ต.ค. 2569) — fixes after the owner's S24 test
- **Tabs ยา / สมาชิก / ตั้งค่า** (no screen yet) used to open an empty page. Now: title + card "หน้านี้กำลังสร้าง" + button "กลับหน้าแรก"
  (chosen over hiding the tabs because the menu order is fixed by the board; remove the note when each page is built).
- **Home "ดูทั้งหมด (อีก N รายการ)"**: N counts only doses not yet prepared (before, it counted prepared ones too). Nothing left = just "ดูทั้งหมด".
- **Status word** ("จัดแล้ว" / "ยังไม่จัด") sits in a nowrap span with its "·": on a narrow screen the whole block moves to the next line.
- **"ถึงรอบซื้อเติมสต๊อก"** is a plain heading (no blue box) until the order page exists (3.3); then it may become a button again.
- **Member filter chips** are shown only when 2+ members have doses today; with 1 member `?who=` is ignored.

## Step 3.2b-1 (18 ต.ค. 2569) — functions that change medicine data (`src/domain/medicine.ts`, no screens)

### Decided by the owner (18 ต.ค. 2569 "ตามที่แนะนำ")
- **O4 (answered)**: adjust dose / stop / resume set the stock base automatically as `{ qty: amount before the change, countedOn: today }`;
  the owner does not recount. The effective date is always today in M3. A medicine without a count gets no count.
- **O5 (answered)**: `addPerson` and `addMedicine` refuse with `sample_present` while `meta.isSample` is true. They never clear the sample
  silently; screen 3.2b-2 asks the owner and calls `clearSample` first.
- **O6 (answered)**: renaming a medicine shared by several members renames it for all of them (one name). `editMedicine` returns `sharedWith`
  so the screen can warn.

### Decisions taken (BRIEF and the message were silent; easy to change)
- **Call shape**: `fn(root, …, ctx)` where `ctx = { today, nowIso, newId }` (`MedicineContext`). Extra inputs are one object
  (`adjustDose(root, id, { schedule, reason, note? }, ctx)`, `stopMedicine(root, id, { reason, note? }, ctx)`,
  `resumeMedicine(root, id, { note? }, ctx)`), not loose positional arguments, so `ctx` can always be last.
- **Result**: `{ ok: true, root, … }` or `{ ok: false, error }`. Every ok root is checked with `rootSchema` inside the function; a failure there
  returns `invalid_data` (should never happen; it means a bug or a bad `ctx`).
- **Name** is saved trimmed (2–60 characters, counted like the schema). Matching a shared medicine ignores outer spaces and letter case only (Q6).
- **Unit** is trimmed, must not be blank, and must equal the shared medicine's unit exactly. `unit_mismatch` is checked before `duplicate`.
- **Duplicate** means the same member and the same medicine that is still `active`. A stopped copy does not block adding it again.
- **Blank text**: a blank note in `addMedicine` is an error (`invalid_note`), same as a blank note in an edit patch (use `null` to remove).
  Event notes (adjust / stop / resume) may be left out or blank = no note; more than 200 characters = `invalid_note`. Assignment notes have no length limit (the schema has none).
- **Edit compares with what the person sees today**: `from.stockQty` is the amount today (`stockNow`, or the frozen count while stopped), not the old base.
  Typing the same number as today is "no change" (nothing written). A different number is a recount: `stock = { qty, countedOn: today }`.
  `stockQty: null` removes the count. A stopped medicine can be recounted; the count survives resume.
- **Shared rename events**: the edited member's event holds all changed fields; every other member using the medicine gets an `edit` event with the name only.
  `sharedWith` = number of assignments (active or stopped) using the medicine, returned on every ok edit.
- **Person colour** (`addPerson`): rotates blue, green, yellow, gray by how many members exist (the form has no colour choice yet). `insurance` is `{}`, no birth year.
- **Not checked** (not asked): editing / stopping a medicine of a removed member is allowed by the functions (screens do not reach them); an empty meal schedule
  (no slot) passes the schema, so the screen must not offer it; effective date is always `ctx.today`, no back-dating.

### Open question for the owner (does not block this step)
- None that touch the numbers. If unit editing is wanted later (`editMedicine` does not support it), the owner must decide what happens to prices and shared members.

