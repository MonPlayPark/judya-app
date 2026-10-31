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


## Step 3.2b-2 (18 ต.ค. 2569) — screens: all medicines, add medicine (3 steps), medicine detail

### Decided by the owner (18 ต.ค. 2569 "ตามที่แนะนำ")
1. No ready-made medicine list this round. The name field takes a "source" (`SuggestionSource`, `domain/suggest.ts`); today the source is the names already in the house (`houseSuggestions`), matched ignoring letter case and outer spaces, from 2 characters. Always a row "ใช้ชื่อ “…” ตามที่พิมพ์". A medicine list can be plugged in later without touching the field.
2. O4: adjust / stop / resume take effect today only. The date field is the words "วันนี้ (วันที่ …)", not editable; no recount question.
3. O5: while `meta.isSample` is true the first step shows the box "ต้องลบข้อมูลตัวอย่างก่อน" (cancel / "ลบตัวอย่างแล้วเริ่ม" which calls `clearSample`). `addPerson` / `addMedicine` are never called while it is a sample.
4. O6: renaming a medicine used by 2+ members asks first: "ยานี้ใช้อยู่ N คน การแก้ชื่อจะเปลี่ยนให้ทุกคน" (N counted from assignments before saving).
5. Empty house: step 1 has a simple add-member form (name, relation, switch "จัดยาทานเอง" -> `addPerson`). The full members page (3.2c) will replace it.

### Hidden because the page is not built yet (Q12) — show when the page exists
- Medicines: tab "ยาสามัญประจำบ้าน" and its add button (3.3). Detail: "ราคาตามร้าน" section (3.3), "แชร์ให้แพทย์" (3.4). Member page links (3.2c).
- The sentence "(ฟีเจอร์นี้กำลังจะมา)" about allergies is cut; picking the reason "แพ้ยา" only says "ถ้าแพ้ยานี้ ควรแจ้งแพทย์หรือเภสัชกร". The board's owner chip "ยาสามัญประจำบ้าน" in step 1 is not offered either.
- The bottom tab "ยา" is now the real page.

### Decisions taken (board / message silent; easy to change)
- Branch: worked on the session branch `ccr-d4f6ddc2-2t2963` (the task said "new branch"; the session instructions fix this one).
- Data layer: `addPerson`, `addMedicine`, `adjustDose`, `stopMedicine`, `resumeMedicine`, `editMedicine` on `DataContext` return `{ ok: true, … }` or `{ ok: false, error }`; a valid change that cannot be written returns `save_failed` and memory + disk stay as they were. These methods do not raise the global "บันทึกไม่ได้" bar (no retry of a stale change); the form shows the Thai reason and the person taps save again. ids: first 12 hex chars of `crypto.randomUUID()`.
- Error texts live in `domain/errorText.ts`; a test scans `medicine.ts` for every code so none is missed.
- Step 1 gate for the sample, not at the final save (otherwise the draft could point at sample members that get deleted). Deep link `#/meds/new` with a sample shows the same box.
- Step 1 preselects the owner when there is exactly one member (no risk of a wrong owner). `?member=` also preselects. Duplicate (same member already uses the medicine) stops at step 1 with the Thai text; the same text still shows if the save is refused.
- Step 2 shows amounts in the draft unit ("เม็ด" until step 3 changes it; a shared medicine uses its own unit). Step 2 has a frequency section (every day / every other day from today / pick days) that the board's AddSchedule did not have (it exists in the adjust form of the Med boards); one editor (`ScheduleEditor`) serves both.
- Dates when editing a schedule: a running "every other day" anchor and a course start date stay as they were if nothing but them would differ; any real change restarts from today.
- Unit has chips เม็ด แคปซูล ซอง มล. ขวด หลอด แผง กล่อง + own text; a medicine already in the house locks to its unit. Step 3 has no note field (not asked).
- Detail: "เหลืออยู่" shows the number (stockNow, or the frozen count while stopped) and "พอทาน N วัน (ถึง <last covered day>)"; 0 left = "หมดแล้ว"; N = 0 = "ไม่พอสำหรับวันนี้"; stock covers the whole short course = "พอทานตามวิธีกินที่ตั้งไว้". No count = "ไม่ได้ใส่จำนวนคงเหลือ". Texts of how it is taken include before/with/after meal in the detail, history and adjust form (the list row keeps the short board text).
- Stopped medicine: the "ปรับโดส" button is hidden (the function refuses it); "แก้ไขข้อมูลยา" and "กลับมาใช้ยานี้อีก" stay. Resume has no form (board: one tap).
- Edit form: leaving the count empty removes the count ("ไม่นับสต๊อก"); the number shown is today's number, typing it unchanged is "no change".
- List: badges are the warnings (expired, low, expiring); if none, "สต๊อกพอ" or "ไม่ได้ใส่จำนวน"; stopped rows show only "หยุดใช้แล้ว". "ยา N รายการ" counts active medicines. Members without medicines are listed with "ยังไม่มียา". The board's link "ไปที่ยาวันนี้" is kept.
- Page not found for a medicine of a removed member too.
- The draft of the add flow is in memory only (`DraftContext`); the list's "เพิ่มยา" button starts from an empty draft.

## Step 3.2d (18 ต.ค. 2569) — backup / restore, Settings page, storage promise

Done before 3.2c because the owner already enters real data that lives only in Chrome's localStorage.

### Hidden because the part is not built yet (Q12) — show in step 3.3
- Settings board section "ร้านค้า" (shop list + shop form + delete shop).
- Settings board section "ข้อความสั่งยาไปร้าน" (order template, tokens, preview).
- Home "เปลี่ยนเกณฑ์" link (the Settings page now exists, but it was not asked for in this step; add it when wanted).

### Extra proposals by the team lead (owner has not seen them on screen; easy to cut, each is small)
1. Settings: "เตือนยาใกล้หมด" (`settings.lowStockDays` 1–60, default 7). Same form as the expiry one; chips 3 / 7 / 14 / 30.
2. Home: one quiet line "ไม่ได้สำรองข้อมูลมา N วันแล้ว / ยังไม่เคยสำรองข้อมูล · สำรองข้อมูล" (link to `#/settings`). Plain text + icon, no pop-up. Cut = delete `BackupReminder` in `HomePage.tsx`.
3. Problem screen (corrupt / other version): button "นำกลับจากไฟล์สำรอง". The page already existed, so it only got the button (same `RestorePanel`). Not shown for "unavailable" (nothing could be written).

### Decisions taken (BRIEF / board / message silent; easy to change)
- **Board**: it has only the expiry section (− / + and chips 7 / 15 / 30 / 60, no text field), so "custom value" = the − / + buttons. The backup, restore and storage sections have no board; they use the same cards, chips, info boxes and buttons. The board's footer disclaimer "ข้อมูลตัวอย่างเพื่อดูหน้าจอ · ไม่ใช่คำแนะนำทางการแพทย์" is not on the Settings board, so it is not shown (this page does not talk about doses).
- **5 MB** = 5 × 1024 × 1024 bytes, counted in bytes of the file (a Thai letter = 3 bytes). A chosen file is checked by `File.size` before it is read.
- **Error codes**: a file that has no `version` key (or is not an object, e.g. `[]`, `42`) is `invalid`, not `wrong_version` (it does not claim to be another version). `wrong_version` = has `version` and it is not 2.
- **Summary "ยา M รายการ"** = every assignment (stopped included), also those of a removed member; members = not removed. If the owner wants removed members' medicines left out, change `summarizeRoot` only.
- **File** = the root as compact JSON (same text as stored) with `meta.lastBackupAt` = the time of the tap. The same time is saved in the app by `markBackedUp`, only after sharing / download succeeded. `meta.isSample` is kept if the house is the sample.
- **Share**: `navigator.share({ files })` only when `canShare({ files })` is true. Closing the sheet (`AbortError`) = nothing saved, text "ยกเลิกแล้ว ยังไม่ได้สำรอง". Any other share error = download instead. If the file was handed over but the date cannot be saved: an error says so, no "done" message.
- **Restore** copies the current text of `judya.v2` to `judya.v2.prev` (also when it is unreadable), saves, reads back; on any failure both keys return to what they were. The screen does not mention `.prev` (there is no screen to use it yet).
- **Storage promise**: asked on every app open until the browser has promised, and once more after the first medicine is saved (Chrome decides by its own rules, so a later ask can succeed). Settings shows ใช่ / ไม่ / ไม่รองรับ by reading `persisted()`; "ไม่" = not promised yet. The text never says the data is safe; even "ใช่" says clearing web data still removes it.
- **App version** at the bottom of Settings = `package.json` version + short git commit (`__APP_VERSION__`, set in `vite.config.ts`), so the owner can tell which build runs.
- **Saving settings** writes on every tap (no debounce); a refused or unsaved value never changes the number on screen and shows the reason under the chips.

### Note on the owner's example 6
`2026-11-01` is 14 days after `2026-10-18`, so it already shows as "อีก 14 วัน" with the default 15. The numbers are right and tested as written; the test also uses 7 (not listed), 13 (not listed), 14 and 30 (listed) to show the new value is used at once.

## Step 3.2c (18 ต.ค. 2569) — members: list, one member, add / edit form, take out / put back

### Hidden because the part is not built yet (Q12) — show when it exists
- Member page: "เพิ่มบันทึกแพ้ยา" button (the status "ยังไม่พบการแพ้ยา" and the text "ยังไม่ได้บันทึก — ถามแพทย์/เภสัชกรก่อนใช้ยาใหม่" stay), "สั่งยา" (3.3), "แชร์ให้แพทย์" and "สรุปพบแพทย์" (3.4). The quick-button grid has one button, "จัดยาวันนี้", at full width; go back to two columns when the others come.
- Home: there was no link to members, so none was changed. The home member cards and the "ดูทั้งหมด" link of the members card are still not tappable (left as in 3.2a-2). Add them if wanted.
- Medicines page: the member name is not a link to the member page (not asked).

### Decisions taken (board / message silent; easy to change)
- **Take out = only `removedAt`**. No event is written (events have no member-level type), so "events unchanged" holds. Checked every place that reads members: today, home care list and member cards, all medicines, medicine detail and the today filter chips already skip removed members; the tests prove it. No number code was touched.
- **Stock while a member is out**: nothing pauses. `stockNow` still counts the calendar days, so a member put back after 10 days shows 10 days of doses less than before. The owner's example (same `today` before and after) holds. If the owner wants the days out not deducted, that changes stock numbers: ask first.
- **Backup summary** counts medicines of removed members (as in example 3: 1 member, 3 medicines) and the backup reminder treats a house with only removed members as "has data" (their data is in the file, so it must be backed up).
- **Colour of a new member**: first colour that no member in the house uses; all four used = start again from blue (by member count). Removed members do not use a colour. The form pre-selects it.
- **Birth year** is typed as digits only (letters cannot be entered). The message shows after leaving the box or pressing save ("ใส่ปี พ.ศ. 4 หลัก ตั้งแต่ 2400 ถึง {ปีนี้}"); the save button stays on, pressing it with a wrong year only shows the message. The same rule (`checkBirthYear`) is used by the domain and the screen. Insurance max 60 characters (also the box limit).
- **A patch that changes nothing** in `editPerson` is ok (same root), not an error: saving an untouched form just goes back.
- **New member needs a relation** (same as the small form in add medicine): the save button says "เลือกว่าเป็นใครของเรา แล้วค่อยกดบันทึก". The name is the first reason shown.
- **Save failure** follows the existing methods: the data layer returns `save_failed`, the form stays and shows the red alert "บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ …" (not the global bar with retry: a retry would run a stale change while the form is still open).
- **Sample data**: new / edit forms show the "ต้องลบข้อมูลตัวอย่างก่อน" box before the form (`ClearSampleDialog`, now shared with add medicine); "นำกลับ" with a sample also asks. Editing a sample member and agreeing deletes the sample, so that member is gone afterwards.
- **Card chips**: "ทานวันนี้ N ครั้ง" = rows of that member in "ยาวันนี้" (same `todayDoses`). Stock chip: ใกล้หมด N รายการ / สต๊อกพอ / ยังไม่ใส่ยา / ยังไม่ใส่จำนวนยา (same words as home). A self-managed member shows "จัดยาเอง · เราดูแลสต๊อก" in place of "ทานวันนี้" and still shows the stock chip, also when low.
- **Switch text** in the form: on = "ยาไม่อยู่ในรายการยาวันนี้ แต่แอพยังนับสต๊อกและเตือนเมื่อยาใกล้หมด" (the board says "เตือนให้สั่ง"; ordering does not exist yet).
- **Colour swatches** wrap to a second row at 360px (the board's own 4 x 72px also wrap at 390px); the chosen one has a tick and the colour name.
- **Remove box** uses the shared `ConfirmDialog` (danger button "นำออก" above "ยกเลิก") with the board's wording, not an inline box. It names the saved name, not unsaved typing.
- **Add-medicine step 1 `QuickAddMember`**: kept as the owner approved. It already calls `addPerson`, so it gets the same rules (name, relation, colour pick); it does not ask birth year or insurance.
- **Error text** `person_not_found` no longer says "ในขั้นแรก" (it is now also used on member pages). "ใช้อยู่ N คน" in add medicine still counts a removed member's medicine (it is the same medicine name).
- Removed `BlankPage` ("หน้านี้กำลังสร้าง"): every tab is a real page now.

## Step 3.3a (19 ต.ค. 2569) — house medicines and shops (no prices, no order page)

### Decided by the owner (19 ต.ค. 2569)
- The owner's phone has "เตือนใกล้หมด" set to 14 days by hand; the default in code stays **7** (`DEFAULT_SETTINGS.lowStockDays`, unchanged).
- Step 3.3b (not built here): the order page ticks only low items automatically; a regular medicine with unknown stock is shown but not ticked; the price of a regular medicine must ask "1 sell unit = how many medicine units". The data model already has `perSellUnit` and needed no change, so nothing here conflicts.
- The LINE message never contains a member's name (3.3b).

### Hidden because the part is not built yet (Q12) — show in step 3.3b
- House medicine edit page: "ราคาตามร้าน". Home / meds: any "สั่งยา" button or link. Settings: "ข้อความสั่งยาไปร้าน" and the order-days field.

### Decisions taken (BRIEF / board / message silent; easy to change)
- **Where the code lives**: the eight actions are in `domain/actions.ts` as asked (same shape as `medicine.ts`: `fn(root, …, ctx) → { ok, root } | { ok:false, error }`, checked with `rootSchema`); the pure checks are `domain/house.ts` (`validateHouseItem`, `cutHouseStock`) and `domain/shop.ts` (`validateShop`). `houseStatus` stayed in `stock.ts` (it already existed and matches the rules: out beats low, `qty <= lowAt`, no stock = untracked). Words: `HOUSE_STATUS_TEXT` = ไม่นับ / ปกติ / ใกล้หมด / หมดแล้ว.
- **Sample rule (O5)**: only the two *adds* (`addHouseItem`, `addShop`) refuse with `sample_present` and the screen asks before clearing. Editing, cutting, deleting or bringing back an item that is already in the sample is allowed, because it cannot mix real data into the sample (the house stays flagged as sample). The members functions are stricter; change here if the owner wants the same.
- **Cut over the stock**: `cutHouseStock` (pure) returns status `warn` and the very same item; the action turns it into the error `cut_over_stock`; the screen shows "ตัดไม่ได้ … จำนวนยังเท่าเดิม". The cut button stays enabled for that (only "no count" and "0 left" switch it off, with a sentence). The cut works on the **saved** quantity (shown as "เหลือในแอปตอนนี้ N"), saves at once, then puts the new number into the quantity box.
- **Numbers**: stock quantity and warn level accept any number >= 0 (the BRIEF has no upper limit and no whole-number rule for them); a cut must be a whole number >= 1. Names: house medicine 2–60, shop 2–40, both trimmed. Duplicate names are allowed for house medicines and shops (BRIEF has no rule).
- **Edit patch**: `null` takes a field away; taking `stock` away while `lowAt` stays is refused (`low_at_needs_stock`), the form sends `lowAt: null` together. A patch / form that changes nothing is ok and writes nothing.
- **Delete / bring back** = `removedAt` (hidden, never erased; its prices stay). As on the board, "นำกลับ" is offered on the page right after deleting, and `#/house/:id` of a hidden item shows the same card. There is **no list of deleted medicines** (see O7).
- **Shops**: deleting really deletes the shop and all prices with that shop (BRIEF section 2). The confirm box says so and, if prices exist, how many. Delivery shop needs a fee (0 = free); free-delivery limit is optional but > 0; a pick-up shop keeps no fee. Phone is trimmed.
- **Badges** on house rows can be several at once (like members' medicines): หมดอายุแล้ว, หมดแล้ว, ใกล้หมด, ใกล้หมดอายุ; none = สต๊อกพอ / ไม่ได้ใส่จำนวน. New badge kind `out` ("หมดแล้ว", danger colour + warning icon + word). The list line always shows the expiry date when there is one (the board showed it only when expired / soon).
- **Notices** at the top of the edit page use `settings.expiryWarnDays` (the board hard-coded 15).
- **Navigation**: tab = `#/meds?tab=house`; the bottom tab "ยา" also stays lit on `#/house/...`. After saving an add the form clears and shows "เพิ่ม X แล้ว" (as on the board); after saving an edit it says "บันทึกแล้ว".
- **Home**: "ยาที่ต้องดูแล" already included house medicines (care.ts); their rows are now links to the edit page. Rows of members' medicines are still not links.
- **Settings order**: the shops card sits after the two day settings and before backup (the board has no backup section).

### Open questions for the owner
| # | Question | Needed by | What was done meanwhile |
|---|---|---|---|
| O7 | Should there be a list "ยาสามัญที่ลบแล้ว" with "นำกลับ" (like members taken out)? The board only offers bring-back right after deleting. | any time (low) | Followed the board; the data is kept, `#/house/:id` still offers "นำกลับ". |
| O8 | Should editing / cutting a *sample* house medicine ask to delete the sample first (like members do)? | any time (low) | Allowed without asking, so the owner can try the sample. |

## Step 3.3b-1 (19 ต.ค. 2569) — order logic, prices, data layer, error texts (no screens)

### Decided by the owner (19 ต.ค. 2569)
- The price of a regular medicine must give "1 sell unit = how many medicine units" (`perSellUnit`), required.
- Order list: only items that are low are ticked by themselves; a regular medicine with unknown stock is shown but not ticked.
- The LINE message never has a member's name; the closing word of the default text is "ค่ะ"; the default low-stock warning stays 7.

### Decided by the team following the BRIEF ("ตามข้อเสนอของทีม") — easy to change
- **Files**: `domain/price.ts` (`validatePrice`), `domain/order.ts` (`orderLines`, `compareShops`), `domain/orderMessage.ts` (`DEFAULT_ORDER_TEMPLATE`, `orderLineText`, `buildOrderMessage`, plus `messageLines` which turns the ticked lines and the chosen shop's row into message lines), `targetDoses` in `domain/stock.ts`, `setPrice` / `deletePrice` / the two new settings in `domain/actions.ts`. Nothing of the old `compareShops` / `lineCost` / `purchasePlan` in `calc.ts` is changed or imported (its 18 tests are untouched).
- **Error codes**: `invalid_price`, `invalid_sell_unit`, `per_sell_unit_required`, `invalid_per_sell_unit` (price form, all wrong fields reported by `validatePrice`; `setPrice` returns the first in that order), `price_not_found` (deletePrice), `invalid_order_days` (7–90). Reused with their old Thai texts: `shop_not_found`, `medication_not_found`, `house_item_not_found`, `house_item_removed`, `sample_present`.
- **`setPrice` check order**: shop exists → medicine exists (house: exists and not deleted) → sample (only for a NEW price) → the field checks. Changing an existing price while the house is the sample is allowed (same idea as editing a sample item in 3.3a, O8). Setting the same values again returns the same root and the same id.
- **`deletePrice(root, priceId)`** deletes by price id (the screen has the id from the list). It also works for the price of a deleted house medicine.
- **Prices of deleted house medicines** stay untouched when the medicine is deleted and brought back; but `setPrice` refuses a deleted house medicine (also to change its old price).
- **`targetDoses`** (stock.ts) = sum of the real doses over `today … today+orderDays−1` with the same pause rule as `stockNow`; an assignment with `status: 'stopped'` gives 0. Not an average.
- **`orderLines`**: an assignment is skipped when its member or its medication does not exist (broken data) as well as when the member is taken out or the assignment is stopped. A house medicine without a stock count is never listed; "หมดแล้ว" (0 left) is listed. A line whose need is 0 (low, but the target is already covered) stays on the list with qty 0 and is not ticked. A regular line carries `assignmentIds` only — no member name.
- **`compareShops` input**: it takes the lines from `orderLines` (with the owner's changed `qty`) and itself ignores lines that are not ticked or have qty ≤ 0. Result: `{ rows, missing }`. `rows` = shops with every price, cheapest first (total rounded to the satang; same total → shop name, `localeCompare 'th'`). `missing` = every other shop with the keys it lacks (also a shop with no price at all). A row holds items total, shipping, total (shipping only counted when `includeShipping`), the priced lines (sell units, sell unit, per sell unit, price, cost) and `buyMore`. `buyMore` = free-over − items total, only for a delivery shop with fee > 0 and a free-over amount not reached yet; it does not depend on the shipping switch.
- **Money** is rounded to the satang at every line, at the items total, and at the final total. The free-delivery test uses the rounded items total (`>=`).
- **Sell units**: regular medicine `max(1, ceil(qty / perSellUnit − 1e-9))`; house medicine = qty.
- **Message**: a blank shop name counts as "no shop" (→ "ร้านยา"). The list is built in one pass over the template, so `$&`, `$1` or the text `{ร้าน}` inside a medicine or shop name stays as typed. The text of the bracket in a regular line is the bought pills (`sell units × perSellUnit`, shown with ½ like everywhere else). A house line without a shop uses the unit of its stock.
- **`orderTemplate`** is stored exactly as typed (no trim, no length limit; empty = default text is used when the message is built).
- **Old error test updated**: `errorText.test.ts` listed the exact settings codes; it now also lists `invalid_order_days`. No other old test was changed.

### Hidden / not built here (all screens are 3.3b-2)
Order page, price boxes, "ข้อความสั่งยาไปร้าน" and order-days fields in Settings, the list of deleted house medicines (O7), and 3.4.

## Step 3.3b-2 (19 ต.ค. 2569) — screens: prices per shop, order days + order message text, deleted house medicines

### Decided by the owner (19 ต.ค. 2569)
- A regular medicine's price must give "1 sell unit = how many medicine units" (required). O7 solved: there is a list "ยาสามัญที่ลบแล้ว" with "นำกลับ". O8: editing / cutting a sample house medicine without asking to clear the sample is fine. Closing word of the default text is "ค่ะ"; default low-stock warning stays 7.
- Everything else below: "ตามข้อเสนอของทีม" (board / BRIEF, easy to change).

### Opened in this step (were hidden)
- `MedDetail.tsx` and `HousePages.tsx`: section "ราคาตามร้าน" (one shared component `components/PriceSection.tsx`). `SettingsPage.tsx`: "จำนวนวันที่สั่งยา" and "ข้อความสั่งยาไปร้าน" (`OrderMessageCard.tsx`). `MedsPage.tsx` house tab: "ยาสามัญที่ลบแล้ว (N)".

### Still hidden (step 3.3b-3 and 3.4)
- The order page `#/order` and every "สั่งยา" button / link (home, member page, all medicines). A test checks no `a[href="#/order"]` and no "สั่งยา" link or button on 7 pages. "แชร์ให้แพทย์" and the allergy button (3.4).

### Decisions taken by the team
- **Price section**: shown on the medicine page only in the normal view (not while adjust / stop / edit is open, as the board's `showActions`); on the house page after the form and before "ลบยานี้"; not shown for a deleted house medicine (its page is the "ลบแล้ว" card).
- **Intro sentences** are cut down so they do not promise a comparison page that does not exist: medicine "ใส่ราคายานี้ของแต่ละร้าน", house "ใส่ราคาต่อ 1 หน่วยที่ร้านขาย" (the board adds "หน้าสั่งยาจะเทียบให้"). Add that back in 3.3b-3.
- **Delete a price**: the button "ลบราคานี้" is inside the open price form (as on the board), then a ConfirmDialog, then `deletePrice`. The row itself has one button (ใส่ราคา / แก้ไข).
- **Form**: the save button is always on; pressing it checks with `validatePrice` and shows every wrong box at once under the box (a message goes away when that box is typed in). Only a passing form calls `setPrice`. New price starts with sell unit "กล่อง" (board). Own sell unit max 12 letters (board). Numbers are not changed: 12.5 is stored and shown as 12.5; amounts are shown without thousands separators (฿1500).
- **Shared price sentence** counts assignments with `status: 'active'` of members who are not taken out (`priceSharedCount`), shown when N > 1.
- **Sample**: a NEW price with sample data asks (ClearSampleDialog); cancelling keeps the form as typed; changing an existing price never asks.
- **Order days**: same `DaysSetting` card (− / +, chips 7 14 30 60 90, applies at once). The − / + buttons stop at 7 and 90, so 6 / 91 can only come from code; the refusal is tested through `DataContext.setSettings`.
- **Order message card**: the box has its own "บันทึกข้อความ"; "ใช้ข้อความตั้งต้น" only fills the box (save is a second step, as asked). Extra (not asked, small): two buttons "ใส่ {ร้าน}" / "ใส่ {รายการ}" that insert at the cursor, because curly brackets are hard to type on a phone keyboard; a yellow note when the text has no {รายการ} (the list is then added at the end, as `buildOrderMessage` does). Stored: `''` only when the box is exactly empty or exactly `DEFAULT_ORDER_TEMPLATE`; a text of only spaces is stored as typed (the builder treats it as default). After saving an empty box the box shows the default text again.
- **Preview sample**: "ยาตัวอย่าง เอ" x 2 กล่อง with 30 เม็ด per กล่อง (so the line reads "(60 เม็ด)" as in the owner's example) and "ยาสามัญตัวอย่าง" x 1 ขวด; no member names anywhere.
- **Deleted house list**: folded by default, a button bar with `aria-expanded`; "นำกลับ" has the item name in its accessible name; the bar stays open while more remain. Its prices were never erased, so they come back with the item.
- **Old tests changed** (they only checked "this part is hidden"): `App.house.test.tsx` (price section now present; order-message card present), `App.meds.test.tsx` ("ราคาตามร้าน" no longer in the hidden list), `App.settings.test.tsx` (three "ไม่ต้องกดบันทึก" lines, the text box has its own save button, new headings). No other old test touched. No schema change, no new localStorage key.

## Step 3.3b-3 (19 ต.ค. 2569) — the order page `#/order` and the "สั่งยา" buttons

### Decided by the owner (19 ต.ค. 2569)
- +/−: one sell unit of the chosen shop (one pill when no shop has every price); house medicine one at a time, at least 1. The LINE text on this page is shown only (edited in Settings); buttons copy / open LINE / call. A regular medicine with unknown stock is shown but not ticked; only low items are ticked by themselves.

### Opened (were hidden)
- Home: button "สั่งยา N รายการ" (just "สั่งยา" when the order page lists nothing) inside the care card, always shown. Member page: quick buttons "จัดยาวันนี้" + "สั่งยา" in two columns (opens the whole-house order page). All medicines: a link "สั่งยา" above "ไปที่ยาวันนี้", under both tabs.
- Old tests turned around (only the "hidden" part): `App.ordersettings.test.tsx` (block "still hidden…" is now "the สั่งยา buttons and links"; `#/order` opens the page), `App.house.test.tsx` ("the order button and price sections stay hidden" -> link is there, price text still not in the list), `App.members.test.tsx` ("hides what is not built yet" no longer lists สั่งยา; new test for the link), `App.screens.test.tsx` (home "buttons … stay hidden" no longer lists สั่งยา).

### Decisions taken by the team (easy to change)
- **Order of the cards** follows the task, not the board: list -> comparison -> shops missing a price -> message -> buttons. (The board puts the message above the comparison; the message depends on the chosen shop, so it comes after it.)
- **The Medicines board has no order link**; it was put above "ไปที่ยาวันนี้" in the same style.
- **stepQty at quantity 0**: + gives the first sell unit (or 1 pill / 1 unit); − stays 0. The − button is switched off whenever − would not lower the number (0, or already one sell unit), so it never raises a quantity. Quantities are not capped.
- **perSellUnit** comes from the chosen row's lines only. A medicine that is not ticked (so not in the row) steps by 1 pill.
- **Small line** under a regular medicine with a chosen shop: "= 2 กล่อง (กล่องละ 60 เม็ด)". A house medicine's quantity shows the shop's sell unit when there is one.
- **Shop cards**: radio buttons; name, total (follows the switch), "รับเอง" / "ส่งถึงบ้าน", for delivery "ส่งฟรี" / "ค่าส่ง ฿40", "ซื้อเพิ่มอีก ฿200 ส่งฟรี" (not tied to the switch), "ถูกที่สุด" on the first row (also when it is the only one), "สั่งร้านนี้" on the chosen one. A pick-up shop has no fee line.
- **Chosen shop** is kept as `chosenId`; when that shop leaves the list the cheapest is used again (the id stays, so the shop returns if it comes back).
- **Copy note** belongs to the text that was copied and disappears when the message changes. No clipboard in the browser = the "copy failed" text.
- **Call button**: only when the chosen shop has a phone; spaces and hyphens removed, `+` kept. No "add phone" variant (the board has one; not asked).
- **Missing prices**: links go to `#/meds/<first assignment id>` (the price is shared by every user) or `#/house/<id>`.
- The page writes nothing (a test spies `setItem` / `removeItem` and compares keys and the stored text). Two icons added: copy, phone.

## Step 3.4 (20 ต.ค. 2569) — share the medicine summary to the doctor (`#/members/:id/share`)

### Decided by the owner (20 ต.ค. 2569)
- Content: member name as typed, every active medicine (name + how it is taken now), start day, last 3 dose changes (adjust / stop / resume, newest first; "edit" not counted), medicines stopped within 90 days (90 included), allergy status, date. Picture + text, made on the device. The allergy line is always "การแพ้ยา: แอพนี้ยังไม่มีข้อมูลการแพ้ยา — โปรดสอบถามผู้ป่วยหรือญาติ" (never "ไม่แพ้" / "ไม่มี" / "ไม่พบ"), on every picture; the line "จดโดยเจ้าของแอพ ไม่ใช่เวชระเบียน โปรดตรวจกับซองยาหรือใบสั่งยาจริง" ends every picture and the text.
- "สรุปพบแพทย์" and the add-allergy button stay hidden.

### Decisions taken by the team (easy to change)
- **Stopped medicine with no 'stop' event** (older data): left out of the stopped list; the day is not guessed.
- **Start day** = earliest 'start' event; **latest stop** = the stop event with the latest day (same day: the one written later). Events are sorted by day, ties by write order.
- **Pictures**: 1080x1920 PNG, text 48px (16px at 360px wide), Noto Sans Thai 400/600/700 loaded with `document.fonts.load` before drawing; colours read from the tokens (ink on white / tint header). Header (name, "สรุปยา · date", "หน้า i/n" if more than one), medicine blocks, footer (allergy box + disclaimer) on every picture.
- **Pagination** counts wrapped lines (+ half a line gap per block). Section headings ("ยาที่ใช้อยู่", "ยาที่หยุดใน 90 วันที่ผ่านมา") belong to the first block of their section and are **not repeated** on later pictures (each stopped block says "หยุด …", so it is clear).
- **Wrapping**: Thai dictionary words (`Intl.Segmenter`), letter clusters only for a word wider than a line; a lone ":" ")" "·" "/" stays with the word before, "(" and a number stay with the word after, and "หลังอาหาร / ก่อนอาหาร / พร้อมอาหาร / ก่อนนอน" are never cut.
- **Share**: `navigator.share({files, text})` when `canShare({files})`; closing the sheet = quiet "ยกเลิกการแชร์แล้ว"; any other failure or no support = one download per picture (`judya-summary-<date>-<i>.png`, 0.4 s apart so Chrome does not block them) + "บันทึกภาพไว้แล้ว เปิด LINE แล้วเลือกรูปจากเครื่อง".
- **No medicine at all** (neither active nor stopped within 90 days): only "ยังไม่มียาให้สรุป", no picture is made, no buttons.
- **Member page**: quick buttons are now three in a 2-column grid (the third sits on a second row).
- **Old test turned around**: `App.members.test.tsx` "hides what is not built yet: share to doctor, …" -> the share link is now checked present; the rest of that list (สรุปพบแพทย์, add allergy, เร็ว ๆ นี้) still hidden. No other old test changed.
- No schema change, no storage write, no network call; `downloadFile` / `isAbort` in `state/backupFile.ts` are now exported (no behaviour change).

## Step V1 (21 ต.ค. 2569) — visual refresh foundation (spec: `docs/design/visual-refresh-spec.md`)

### Open questions for the owner
| # | Question | What was done meanwhile |
|---|---|---|
| O4 | **Default font size.** The spec says "normal" = 93%, but 93% makes the 15px minimum (nav labels) 13.95px and the 16px lines 14.9px, below the 15px rule in CLAUDE.md (risk K4). Keep "กลาง" (100%) as the default, or accept "ปกติ" (93%)? | Default is **กลาง (m, 100%)** in `src/prefs/fontSize.ts` (`DEFAULT_FONT_SIZE`). One line to change. |
| O5 | **App size.** With all 48 SVG images in use the build is 1.19 MiB (1,246,210 bytes) against the 1 MB goal; the images add about 424 KB. Which number counts (whole `dist` folder, offline cache, or download size)? Options: minify the SVG files (svgo), drop the mascot from the offline cache, or accept. | Nothing is dropped. Today the images are not imported by any screen, so the build is still 823,618 bytes. The `.webp` files are kept (not imported, not in the build) as asked. |
| O6 | Spec lists member ring colours blue / green / yellow only; the data model has a 4th colour, gray. | No gray token invented. Ask before V4. |

### Decisions taken (easy to change)
- **Where things are**: `src/visual.ts` (typed image helper: `IconName`, `AvatarName`, `MascotPose` unions, `iconUrl` / `avatarUrl` / `mascotUrl`; points at `.svg`), `src/prefs/fontSize.ts` (logic + `useFontSize` hook), tokens in `src/styles/tokens.css`. `src/domain/**` and `src/state/**` untouched.
- **Font size**: `<html data-fs="n|m|l">` → html `font-size` 93% / 100% / 115% (percent, so the Android system font size still works). Existing text, spacing and radius tokens are now rem (1rem = 16px, identical at "กลาง"). `--touch-min` and `--button-h` stay in px so tap targets never drop below 48px. Stored under `judya.fontsize` (not `judya.v2`, not in the backup). Applied in `main.tsx` before the first render.
- **Screens are not changed**: component CSS that has fixed px sizes (icon boxes, row heights) does not scale with the font size yet; V2–V5 restyle them using the new tokens.
- **New token names** follow the existing `--color-*` / `--text-*` style, not the mockup's short names (`--card` = `--color-surface`, `--screen` = `--color-background`, `--ok` = `--color-success-ink`, and so on); only values that were missing were added.
- **Inputs ≥ 16px**: one rule `html body :is(input, textarea, select) { font-size: max(16px, 1rem) }` in `global.css`, so it also holds at "ปกติ" and for inputs added later.
- **user-select: none** on `button, nav, h1, h2, h3` only.
- **Overflow check**: `npm run check:overflow` (script `scripts/check-overflow.mjs`, `playwright-core`, needs a built `dist`). It is not part of `npm test` or CI because it needs Chromium.

## Step V2 (21 ต.ค. 2569) — home screen, mockup round 9

### Answered by the owner
- O6 (gray member ring): use the existing `--color-border-strong` (#80868B). No new token.
- Avatars: no field in the data. The n-th member in the list shows `avatar-0n` (wraps after 12). Nothing is stored. Note: if a member is removed, later members shift one avatar; the rule is easy to change (`avatarForIndex`).

### Decisions taken (easy to change)
- **Mockup source**: round 9 read from the PR #20 branch; where the spec and the mockup differ, the mockup wins.
- **Greeting**: kept "สวัสดีค่ะ" (the mockup says "สวัสดีตอนบ่ายค่ะ" for the sample time). A time-of-day greeting needs the clock and words for the other times; not decided.
- **Left out because the data or the brief does not cover it**: "ถัดไป 18:00 · เย็น" under "ยาวันนี้" (slots have no clock time); "พรุ่งนี้เริ่มจัดเช้า N รายการ" and "สั่ง 28 เม็ด" on the all-done screen; ticking a dose from home (the card still opens "ยาวันนี้").
- **Kept from before**: "ลองดูด้วยข้อมูลตัวอย่าง" button on the first-run screen (below the cards; the mockup has none, but it is the only way to load the sample), the sample banner and the backup reminder, "ดูทั้งหมด (อีก N รายการ)" text, "จัดแล้ว N จาก M" and "ยังไม่จัด" next to each dose (status needs words).
- **Care rows**: the day number is read back from `CareItem.right` (text built by `careItems`), never recomputed. Sort: expired first, then fewest days; house medicines counted in pieces and "หมดแล้ว" count as 0 days (most urgent). Row text: expired "เลิกใช้"; stock days "ยาจะหมดใน N วัน"; expiry "หมดอายุใน N วัน"; house stock "เหลือ N เม็ด". The old detail lines (expiry date, "มี 14 เม็ด", group banners, "เตือนก่อนหมดอายุ N วัน") are not in round 9 and are gone from home.
- **New links** (the mockup shows a chevron on every row): care rows open `#/meds/:id` (house: `#/house/:id`), member rows open `#/members/:id`, "ดูทั้งหมด N" opens `#/meds`, "เพิ่มยา" / "เพิ่มยาตัวแรก" open `#/meds/new` (form reset like on the medicines page). The mockup does not name these targets.
- **All-done member rows**: "ยา N รายการ · จัดครบวันนี้" plus chip "ครบ" (kept the count of medicines).
- **Card icons** follow the mockup: "ยาวันนี้" (today-meds), "ยาที่ต้องดูแล" (expiry-alert, not on the all-done screen), "ยาสามัญประจำบ้าน" (household-medicine), buttons (order, add-medicine). "สมาชิกในบ้าน" has no icon in the mockup, so none.
- **Tokens changed to round 9**: `--ring-size` 7.5rem to 6rem, `--text-ring-size/line` 34/38 to 28/32px; added `--mascot-hero` (100px) and `--mascot-done` (120px).

### Old UI tests whose expected text changed (all home screen, logic unchanged)
`App.test` (h1 on a blank house: "ยินดีต้อนรับค่ะ"); `App.data` (`EMPTY_TEXT`: "เริ่มที่ยาตัวแรก", 6 uses); `App.screens` (all done text; care card three groups to one list; expiry note removed; member rows text and links; "เพิ่มยา" now a link; blank house card); `App.sample` (all-done card); `App.house` (care rows of house medicines); `App.members` (care row numbers after putting a member back); `App.settings` (care row after changing the warn days); `App.ordersettings` (button says "สั่งยา" without the count).

## Owner's answers to O4 and O5 (21 ต.ค. 2569, after PR #19 was merged)
- **O4 default font size**: the owner chose **"ปกติ" (n, 93%)**. `DEFAULT_FONT_SIZE` is now `'n'`. Risk K4 accepted: the smallest text is about 14px (13.95px for the 15px nav labels). If older users find it hard to read, change the default back to `'m'` (one line in `src/prefs/fontSize.ts` and its test). `CLAUDE.md` now says "Smallest text 14px at the 'normal' font size (15px or more at 'medium')".
- **O5 app size**: the owner accepts the size if the SVG files are minified and the images look the same. To be done in V1b (not in V2).

### Font size card in Settings (done in the V2 PR; the rest of Settings stays for V5)
- Card "ขนาดตัวอักษร" is the first card on the settings page: 3 buttons (ปกติ / กลาง / ใหญ่, 48px tall, `aria-pressed`), a sample medicine line and the hint "ถ้าผู้สูงอายุใช้ร่วมด้วย แนะนำ กลาง หรือ ใหญ่" (no quotes around กลาง / ใหญ่, as the owner wrote it). Uses `useFontSize`; the choice is applied at once and stored under `judya.fontsize` only.
- The text "จัดการยา ไม่ใช่คำแนะนำทางการแพทย์" is not added here (V5).


## M4 PR 1 — schema v3, storage key, fixtures (28 ต.ค. 2569)
Everything is new code under `src/domain/v3/`. No v2 file, page, component or test was changed.

### Where the prompt and v2 differ (v2 name kept, as instructed)
- Root tables are `persons` and `events` (the prompt wrote "people" and did not list `events`). `events` stays: MedEvent needs a table.
- `Price` keeps the v2 field `price` (the prompt wrote `unitPrice`) and the `item` reference (`{kind:'med', medicationId}` or `{kind:'house', houseItemId}`). `perSellUnit` is now optional (v2: required); for house items it must be 1 when given. `Price` is `.strict()`, so `receipt` and photo fields are rejected.
- `OrderLine` keeps `unitPrice` (prompt name; there is no v2 order). `source.kind = 'assignment'` uses `assignmentId` as the prompt says (M4-GAP section 4 said `medicationId`).
- Settings keep the v2 fields `expiryWarnDays`, `orderTemplate`, `orderDays`; `fontSize` is new inside settings (in v2 it is the separate key `judya.fontsize`, not touched). `lowStockDays` now accepts any positive number up to 60 (v2: integer 1..60).
- Schedule shape copied from v2 as is (`meal` / `interval`); v3 does not import any v2 file, so v2 can be deleted later.
- Stop reasons: the 4 v2 reasons are used as is. **Waiting for the owner: check the final list against the board "MedDetailStop".** Adjust reasons: `doctor` | `self_or_other`.

### Decisions taken (easy to change)
- Relation list is `ตัวฉัน พ่อ แม่ คู่สมรส ลูก ญาติ อื่นๆ` exactly as the prompt wrote it ("อื่นๆ" without a space, unlike v2 "อื่น ๆ").
- "ตัวฉัน" at most once: counted among people **without** `removedAt`, so a removed "ตัวฉัน" does not block a new one. Not specified; say if removed people should count too.
- Birth year: 2400 up to (this year + 543), checked when the data is validated (uses the phone clock). Still optional, as in v2.
- Avatar names are `avatar-01` … `avatar-12` (the file names in `src/assets/visual/avatars`); a test compares the list with the files. The list is copied into the schema (not imported from `src/visual.ts`, which uses Vite-only code). `avatar` is required.
- `allergies` is required on Person (use `{status:'unknown'}` for a new member). Each listed item needs a non-empty drug and reaction.
- `coverage` is optional; `.strict()` rejects any other field. `company` only when `type = 'private'`.
- Medication keeps v2 `unit` as **optional** display text and `suggestionId`; the prompt did not say whether `unit` stays. Open: derive it from `kind` in a later PR or drop it.
- Kind and pack rule is loose: every kind may use `{type:'none'}`; tablet/capsule → strip or box; liquid → container in ml; cream → container in g; drops → any container; sachet → sachetBox; `other` → anything. Not checked: whether an Assignment's stock kind fits the medicine's kind (count/volume/tubes) — that needs two tables and is left to the PR that writes stock.
- Stock `count`: `strips` whole number ≥ 0, `loose` in 0.5 steps (like v2 pills). `volume`: `ml` 0..99999. `tubes`: `spare` whole number ≥ 0. Assignment `stock` stays nullable as in v2.
- `sideEffects` is on Assignment (max 500 characters), as the prompt says; M4-GAP Q6 asked about Medication.
- MedEvent: one strict object per type. start has `to` only; adjust needs `from` and `to` (different schedules); stop needs a reason; resume has nothing else. `note` (max 200) allowed on all. `edit` is rejected, and Snapshot holds only `schedule`.
- Order: no minimum or maximum number of lines (an order with zero lines is accepted). `unitPrice` may be 0 or missing. `leftover` is `waiting`, `dropped` or null.
- Settings: `lowStockDays` and `fontSize` have defaults (14 and `normal`) when missing from stored data, and `DEFAULT_SETTINGS_V3` carries the same values.
- Storage v3 is the v2 logic in a new file (`v3/storage.ts`); function names are the same (`loadRoot`, `saveRoot`, `startFresh`, `restoreRoot`) and live in the v3 module. Wrong-version here means anything but `version: 3`.
- Fixtures: `blankRootV3()` and `sampleRootV3()` in `v3/fixtures.ts`, fixed dates (2026-10-28), made-up names only. `sampleRootV3()` is separate from the v2 `sample.ts`.

### Not done in this PR (later PRs)
Backup file (`backup.ts`) for v3, the v3 version of `sample.ts` that follows "today", any UI, `judya.fontsize` handling.


## M4 PR 2 — stock / days left / weeks / refill logic (28 ต.ค. 2569)
New files under `src/domain/v3/`: `schedule.ts`, `stock.ts`, `stockText.ts` (+ test each, + `schemaStock.test.ts`). Only v3 file edited: `schema.ts` (rule (จ), below). v3 imports only the date helpers of `src/domain/calc.ts`; no v2 file, page, component or old test touched. No UI.

### Where the prompt and M4-GAP differ
- Weeks: the prompt says N = days / 7 **rounded to nearest**; M4-GAP section 5 / board DoseChangeWeeks said floor. The prompt is used (26 days → "ประมาณ 4 สัปดาห์", floor would give 3). Say if the board's floor is what you want.

### Decisions taken (easy to change)
- **Function signatures changed from v2**: `stockNow`, `daysLeft`, `isLowStock` now take the `Medication` (pack size is there): `daysLeft(assignment, medication, today, events)`. `targetDoses` does not need it.
- `stockUnits` returns `none | tubes | units | error` (a value, never a throw). `daysLeft` adds two statuses to v2's: `tubes` (with `opened`, `spare`) and `error` (with a Thai message). `stockNow` returns `null` for error data; `daysLeft` is where the error shows. `isLowStock` is false for error.
- A **stopped** assignment is `unknown` first, even for tubes (same as v2). So a stopped cream shows no spare tubes in `daysLeft`.
- `count` with strips but a pack without a strip size (`none`, and also `container`) is an error. Prompt only named `none`; `container` is the same case (no strip size) and `other` kind may carry it.
- **Schema rule (จ)** is a root-level refinement: each assignment is checked against its medication. An assignment whose `medicationId` is not in the list gets no stock issue from this rule (cross-reference checks are not part of it). The same helper `stockProblem` is used by `stockUnits`, so schema and logic agree. PR 1 fixtures already obey the rule; no fixture was changed.
- Not-daily means a **meal** schedule with `days.kind` of `alt` or `weekdays`. An interval schedule counts as daily (it has no days rule). "Any period" is read as: before **or** after a dose change (`unitFor(beforeSchedule, afterSchedule)`), so both sides use weeks if either is not daily.
- Texts (proposed, change freely): days left 0 for a daily medicine = "ไม่พอสำหรับวันนี้" (same as v2; the prompt only said "N วัน"); weeks mode at 0..14 days = "ไม่ถึง 2 สัปดาห์"; enough = "พอใช้ตลอดคอร์ส"; unknown = "ยังไม่ได้นับ" (both as the prompt wrote); tubes = "นับเป็นหลอด ไม่คำนวณวัน"; error = "ข้อมูลสต็อกไม่ตรงกับยา"; change text = "ก่อน → หลัง".
- `refillStock(assignment, medication, events, today, amount, newExpiry?)` also takes the medication (strip size). Result is `{ok:true, assignment} | {ok:false, error}`. After a count refill the total is written back as whole strips + loose (e.g. 34 pills of 10 = 3 strips + 4). With stock = null the amount is stored as entered. Adding 0 (or less) is an error. Adding a different kind than the stock holds (e.g. ml to a count stock) is an error. A **stopped** medicine can be refilled (the stop events are used for the quantity); status is not changed.
- Refill of tubes adds to `spare` and keeps `opened`; with no stock yet it starts at `opened: false`. No `countedOn` for tubes.
- Expiry: nearer date wins; one alone is used; none stays none (the `expiry` key is then absent).
- `openNewTube(assignment)`: only for tubes stock; spare 0 → error "ไม่มีหลอดสำรองให้เปิด".

### Waiting for the owner
- **Low-stock rule for cream / drops**: the design gives none, so `isLowStock` is always false for tubes. Decide what "ใกล้หมด" means for them (e.g. no spare tube left and the open one marked empty?).
- **Liquid dose limit**: the v3 schedule keeps v2's `pills` between 0.5 and 4. For a liquid that is ml per dose, so a 5 ml spoon cannot be written. Not changed here (schedule shape is PR 1 / owner's call). Decide the ml range for liquids before the add-medicine screen (PR 6).
- Weeks: nearest (prompt) or floor (M4-GAP)? See above.


## M4 PR 3 — backup / restore v3, cross-table checks, weeks rounding (29 ต.ค. 2569)
New: `src/domain/v3/backup.ts` (+ `backup.test.ts`, `schemaRefs.test.ts`). Edited v3 files: `schema.ts`, `stockText.ts` and the PR 1–2 tests that depended on them. v3 imports only the date helper `diffDays` from `src/domain/calc.ts` (the Thai-date helper is written again inside `backup.ts` as `bangkokDate`, so `src/domain/today.ts` is not imported). No v2 file, page, component or old v2 test touched. No UI.

### Changed from PR 2
- **Weeks now round down** (`Math.floor(days / 7)`), as the board DoseChangeWeeks says: 14 → "ไม่ถึง 2 สัปดาห์", 15 and 20 → "ประมาณ 2 สัปดาห์", 21 and 26 → "ประมาณ 3 สัปดาห์". This replaces the PR 2 choice (nearest) and closes the PR 2 question. Tests changed: `stockText.test.ts` (rounding test), `stock.test.ts` example 8 (26 days is now 3 weeks, was 4).

### Cross-table checks (root-level rule in `schema.ts`)
- Refused, with a message that names the table, the row id and the missing target (e.g. `assignments "a1": medicationId "x" is not in medications`): assignment → medication, person; event → assignment; price → shop, medication / house item; order → shop; order line (assignment / house) → assignment / house item. A `free` line is not checked.
- The same id twice in one table is refused (`persons: id "p1" is used more than once`), for all 8 tables. The same id in two different tables is fine.
- A removed person (`removedAt`) stays in `persons`, so it can still be referenced. Same for removed house items and stopped assignments.
- The PR 2 stock rule still skips a medication that is not found; the new rule catches that case first (one message only). The old PR 2 test about this was changed to expect the refusal.
- Fixtures of PR 1 already obey the rules; none was changed. Three storage tests used `shops: []` as a "different data" example; that now breaks references, so they use `prepLog: {}` instead.
- A refused file/data is `invalid` (backup) or `corrupt` (load); the screen shows the usual "file is damaged" message. The detailed message is for developers and tests, not for the owner.

### Backup file
- The file is the v3 root as JSON (`version: 3`), nothing around it, with `meta.lastBackupAt` stamped (same as v2). So a restored house differs from the original only in that stamp.
- **File name**: `judya-backup-YYYY-MM-DD-v3.json` (v2: `judya-backup-YYYY-MM-DD.json`), date = Thai date of `nowIso`.
- `summarizeBackup(text)` order: size (> 5 MB = `too_big`, counted in bytes) → JSON (`not_json`) → a `version` that is not 3 (`wrong_version`; v2, v4, even the text "3") → full schema (`invalid`, also when there is no `version` at all, or the JSON is `null` / a list).
- Summary = `{ members, medicines, houseItems, orders, text }`. Members and house medicines exclude removed ones; medicines (assignments) include stopped ones; orders include every status. Text: `สมาชิก 7 คน ยา 7 รายการ ยาสามัญ 2 รายการ ใบสั่ง 4 ใบ` (proposed, change freely).
- Restore = `summarizeBackup` then `restoreRoot` (PR 1; copies the old text to `judya.v3.prev` first). There is no other way to restore in this file. "No restore unless the owner confirms" is the screen's job (later PR); the functions here never write.
- `makeBackup` does not save the stamp into storage. `markBackedUp(root, nowIso)` returns a new root with `meta.lastBackupAt`; the screen should save it only after the file was really handed over, so the banner does not disappear when the user cancels.

### Home banner functions (no UI yet)
- `shouldShowNeverBackedUp(root)`: has medicines (at least 1 assignment, or at least 1 house medicine that is not removed) and no `lastBackupAt`. Written exactly as asked, so the **sample house also counts** (it has medicines and no stamp). Decide later if the sample should hide the banner (v2 did).
- `needsBackupWarning(root, today)` / `backupAge`: ported from v2, more than 14 days since `lastBackupAt` (Thai dates). Two changes from v2: it is false when the house has no medicines, and false when there was never a backup (that case is the function above, so the two do not overlap).
- **Waiting for the owner: keep the "more than 14 days" reminder or not?** Ported as a separate function so it can be dropped by deleting one function and one branch of `backupBanner`.
- `backupBanner(root, today)` returns one banner or null: never backed up → `{kind:'never', text:'ยังไม่ได้สำรองข้อมูล'}`; backed up but over 14 days → `{kind:'old', text:'ไม่ได้สำรองข้อมูลมา N วันแล้ว', daysAgo}`; otherwise null. Texts are proposed (the second is the v2 Home text).
- A backup date after `today` (phone clock moved back) gives no warning.


## M4 PR 4 — Home v3 (29 ต.ค. 2569)
New: `src/domain/v3/home.ts`, `homeDemo.ts` (+ tests), `src/pages/v3/HomeV3*.tsx|css`, `src/components/v3/ComingSoon`, `V3Nav`. Edited: `src/App.tsx` (route `#/n` only), `scripts/check-overflow.mjs`, docs. No v2 file and no earlier v3 file changed. Route `#/n` is rendered **outside** `DataProvider`, so it never reads `judya.v2`.

### Where the prompt, board and picture differ (prompt wins)
- Not copied from the picture: bell / profile icon, clock times (08:00), the "ตารางยา" card, the date in the picture. Date pill = today's Thai date, plain text like the board (not a button: it has no destination).
- **Colours**: the board and picture use navy headings (#013073) and a light band (#EAF3FF). Not in `tokens.css`, so tokens are used instead (ink headings, `--color-band`). Owner: add a navy token if the navy look matters.
- **Logo mark**: the repo has no JY-house mark. (Old note, closed in PR 4b: the real mark is now `public/icons/judya-mark.svg`.) Mascot = `mascot/wave.svg` (looks like the picture's character).
- **Shortcuts**: 3 tiles in the order given (สั่งซื้อยา, แชร์ให้แพทย์, รายการยา); the third is full width so no cell is empty. The board's 2x2 grid would leave a hole.
- **Dose keys** in `prepLog`: `<assignmentId>:<slot>` (morning/noon/evening/bedtime), as the PR 1 fixture (`a1:morning`). The interval key `<id>:HH:MM` is not shown by any v3 file; it follows v2. Owner: confirm.
- Ticks older than 14 days are dropped on each tick (v2 rule). Self-managed members are left out of today's doses (BRIEF: "ไม่ขึ้นยาวันนี้"); their chip says "จัดยาเอง".
- The "today" card title and the care rows are plain (the board links them to `#`): no destination yet. "ดูทั้งหมด N" is replaced by at most 3 rows + "และอีก N รายการ".
- Care order: expired, out, low, expiring; a medicine is listed once under its worst problem. Texts I set (board has the first, third, fourth): "ยาหมดอายุแล้ว N รายการ", **"ยาหมดแล้ว N รายการ"** (house medicine at 0), "ยาใกล้หมด N รายการ", "ยาใกล้หมดอายุ N รายการ". Chips: "เลิกใช้", "หมดแล้ว", days-left from `formatDaysLeft`, "เหลือ N หน่วย" (house), "N วัน" / "วันนี้" (expiry). Cream / drops are not warned about low stock (`isLowStock`), expiry still counts.
- Backup banner (`backupBanner()`) is the last warning, so a care warning shows first and the backup becomes part of "+N เรื่อง". The "มียาที่ต้องซื้อ" sub-line is the orange warning itself; no extra sub-line.
- Greeting sub-lines: S0/S1 "มาเริ่มจัดยากันเลย"; no dose today "วันนี้ไม่มียาที่ต้องจัด"; all ticked "จัดยาครบแล้ววันนี้" (green); else "วันนี้มี N รายการที่ต้องจัดยา". Member with no dose: "วันนี้ไม่มียาที่ต้องกิน" (board).
- **Interval medicines** (every N hours) have no meal period. Rows are placed by clock hour: 04–10 เช้า, 11–15 กลางวัน, 16–20 เย็น, 21–03 ก่อนนอน, with the text "ทุก N ชั่วโมง". Owner: confirm or choose another way.
- Dose unit word: medicine `unit` text if any, else by kind: เม็ด, แคปซูล, มล., ซอง; cream and drops "ครั้ง", other "หน่วย".
- Default member shown = first with doses today, else first not self-managed.
- Data that cannot be opened (corrupt, other version, blocked storage) shows one red sentence and nothing is overwritten (no recovery screen yet). A tick that cannot be saved shows "บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ …" and the tick is not shown.
- Locked step 2 in S0 ("ต้องเพิ่มสมาชิกก่อน") is plain text, not a disabled button.
- Bottom nav: Home is current (not a link); the other 3 tabs are "เร็ว ๆ นี้". The nav is taller because of the badges.

### Demo mode
`#/n?demo=normal|alert|empty0|empty1|notoday|backup`: made-up house built in memory from the PR 1 fixtures, date fixed to 2026-10-28 (a Wednesday) so every state looks the same any day. No storage call of any kind (tests spy on every `Storage` method, `loadRoot`, `saveRoot`). Badge "โหมดตัวอย่าง ไม่บันทึกข้อมูล". No link to it from the normal screens.

### Waiting for the owner
Navy colour token · logo mark file · interval key and interval periods · "ดูทั้งหมด N" and row destinations (PR 5) · low-stock rule for cream / drops (from PR 2) · whether the sample house should hide the "never backed up" banner (PR 3).

## M4 PR 4b — brand swap: logo, mascot, app icon (30 ต.ค. 2569)

Small PR: images and one token only, no layout or logic change.

- **Mascot pose changed by the owner (30 ต.ค.):** from waving (`wave`) to holding a clipboard (`pharmacist-clipboard.svg`). Alt text is now "น้องเภสัชถือคลิปบอร์ด". `wave.svg` and the other 7 poses stay (v2 uses them).
- **Token:** `--color-navy: #013073` added to `tokens.css` (after `--color-border-strong`); no existing colour touched. Nothing uses it yet (the mark carries its own colour inside the SVG).
- **Files:** `public/icons/judya-mark.svg` (9,802 B), `src/assets/visual/mascot/pharmacist-clipboard.svg` (92,949 B, about 3x `wave.svg`; the app grew by about 64 KB). Both are copied byte for byte (`cmp`), no `<script>`, no external link (only the `xmlns` text), used only through `<img>`. `judya-appicon.svg` is kept.
- **Decided on my own:**
  1. The incoming file was named `judya-mark-1.svg` (its `<title>` says `judya-mark`); installed under the requested name `judya-mark.svg`.
  2. The mascot is imported in `HomeV3.tsx` directly (`?url`) instead of adding a pose to the typed list in `visual.ts` (outside this PR's file list).
  3. The old v2 test `visual.test.ts` counted 48 SVG files in the mascot / icon / avatar folders; changed to 49 (one number and the title). Needed because the mascot lives in the same folder as the others, as asked.
  4. Logo box stays 32px; the mark is wider than tall (1241x1100), so it shows about 30x27px inside it, not stretched.
  5. `theme-color` (`#1A73E8`) and manifest colours were not changed; the brief only asked for the token.
- **Open (closed by PR #28, merged):** the four app-icon PNGs (192, 512, maskable, apple-touch) were updated in PR #28. Original note: the four PNG app icons in `origin/assets-incoming` (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`) are byte-identical (same SHA-256) to the ones already in `main` (the old white-bag-on-blue icon). So the home-screen icon did **not** change. The manifest already pointed at those paths with the right sizes, so it is unchanged. When the new PNGs arrive, copy them over the same four names; no code change needed. Only the browser-tab favicon is new (`judya-mark.svg`).

## M4 PR 4c — period icons from the locked board (30 ต.ค. 2569)

- **Root cause:** Home v3 reused the old line icons from `icons.tsx` (shared with v2) and coloured them with the warning colour (`--color-warning-ink`) per period. That did not match the locked board, and noon / evening looked like warnings.
- **Rule: the locked board is the spec; copy it as-is.** Do not redraw icons or tune shape, colour or stroke width. Only JSX attribute names change (`strokeWidth`, `strokeLinecap`, `style={{ flex: 'none' }}`). If something looks wrong (e.g. contrast), use the board first and report it to the owner. The board colours stay inside `PeriodIcons.tsx` (no tokens), commented "copied from HomeV3.dc.html (canvas v87)".
- **Files:** new `src/components/v3/PeriodIcons.tsx`; `icons.tsx` untouched (v2 uses it). Icon box is 32px wide, no background circle; row min-height unchanged (62px).
- **Greeting:** "สวัสดีค่ะ" uses `var(--color-navy)` (#013073). Contrast on the hero: 9.93:1 on `--color-band` (#d6e6fd), 9.84:1 on `--color-band-done` (#cdebd6).
- **For the owner to decide (not changed):** icon colours on the white card, from the board: blue #1A6FD6 4.90:1, orange-red #D9480F 4.30:1, navy #013073 12.56:1, yellow #F29900 only 2.25:1. The icon sits next to a text label, so it is not alone, but yellow is below the 3:1 usually wanted for graphics.
- **Decided on my own:** the check icon in the "no medicine today" row took its colour from `.rowIcon`; to keep it looking the same, a new class `.rowIconCheck` carries `--color-primary-ink`.

## M4 PR 4d — v3 theme sync (30 ต.ค. 2569)

- **Rule: v3 pages use `.v3theme` (`src/styles/v3theme.css`); `:root` of `tokens.css` (v2) is not changed until the switch at PR 7.** At PR 7: move the values of `.v3theme` to `:root` as the defaults, then delete `v3theme.css` and the `v3theme` classes. `src/styles/v3theme.test.ts` checks every colour of the board and that `:root` is still v2 (primary #1a73e8, background #f8f9fa).
- **Rule kept: the locked board is the spec** (colours, px sizes, spacing, radii copied as they are; nothing tuned by hand). The board file is `project/HomeV3.dc.html`. Where the board and a picture disagree, the board wins.
- **Text size:** v3 text is written as `calc(<px at normal> * var(--fs))`. `--fs` is 1 / 1.075 / 1.24 for n / m / l. Checked in `src/prefs/fontSize.ts`: n / m / l = ปกติ / กลาง / ใหญ่ = 93% / 100% / 115%, default n. The board's own factor is 0.93 / 1 / 1.15 on bigger px numbers (28 x 0.93 = 26); the owner's table is that result at "normal", so the numbers are the same.
- **(Replaced in PR 5a: v3 tap targets are 44px.)** Old note: tap target stayed 48px where the board says 44px (the "จัดแล้ว / รอจัด" button, member heading rows). CLAUDE.md and `check:overflow` require 48px. Width 88px as in the board.
- **Text under 14px:** the board has 13px at "normal" for the sub-line and the "เสร็จแล้ว" chip of the start card (14 x 0.93). The owner's table says secondary = 14/19, and CLAUDE.md says 14px minimum, so 14px is used there.
- **Band colour when all done:** the board keeps `--color-band` (#EAF3FF); only the headline turns green (`--color-success-ink`). The old v2 green band is gone from Home v3.
- **Header decoration without new elements:** the two clouds (the four sparkle strokes were removed in PR 5a) are drawn with `::before` / `::after` of the header (CSS only, from the right-bottom corner so they stay beside the mascot at 360px). No element was added to the JSX.
- **Outside the root:** `V3Nav` and `ComingSoon` render inside `.page`, so they get the theme. The "can't open the data" state of `HomeV3Page` had no root; it is now wrapped in `v3theme page`.
- **Not touched:** the demo bar, the save-error bar, the "และอีก N รายการ" line and the "เร็ว ๆ นี้" badge are not on the board; they keep their v2 rem sizes.
- Found but not changed (structure; needs the owner): see the PR description, section "พบแต่ไม่ได้แก้".

## M4 PR 5a — Home fixes + medicine list v3 (30 ต.ค. 2569)

- **Sparkle strokes removed** from the Home header (`.hero::after` deleted). They sat on top of the text on the owner's S24, and the board (v92) no longer has them. The pale-blue circle behind the mascot stays. `--color-header-spark` is left in `v3theme.css` unused (that file is add-only in this PR).
- **v3 tap target = 44px** (the board value), v2 stays 48px. Done with `--touch-min: 44px` inside `.v3theme` plus explicit `44px` on the Home rows that had 48px. 48px stays only where the board says 48px: the "สั่งยา" button of the care card (`.orderButton`, now written as `48px`), the full-width button of an empty state and "ล้างตัวกรอง" (the last two come with the medicine list). The board wins over CLAUDE.md when they differ; CLAUDE.md line updated.
- **Stale notes fixed:** "app icon unchanged / waiting for PNG" no longer true; the four PNGs are in the repo (PR #28).
- **V3Nav** takes `current: 'home' | 'meds'`; home and meds tabs are real `<a href>` (`#/n`, `#/n/meds`).
- **check:overflow:** the "too short button" limit is 43.5px for v3 pages only (routes starting with `#/n`, function `measureV3`); v2 pages keep 47.5px. Owner approved editing the script. The nav tab keeps `min-height: 52px` (board value).
- **Count:** 7 Home spots changed to 44px (the brief said 9, from an old report); the owner confirmed 7.

### PR 5a — medicine list v3: what was built and what was decided
- **Schema (owner chose A):** `houseItemSchema` got `kind: z.enum(MED_KINDS).optional()`. Old data without it still loads (test `schemaHouseKind.test.ts`); no kind = picture "other". Nothing else in `schema.ts` / `stock.ts` changed. `home.ts`: only `MONTHS` is now exported (short Thai month names).
- **Files:** `domain/v3/medsList.ts` (pure model), `medsListDemo.ts` (demo houses), `components/v3/KindIcon.tsx` (7 inline SVGs from the owner's text, no new file in `assets/visual`), `pages/v3/MedsListV3.tsx` + `.module.css` (view), `MedsListPage.tsx` (data and clock). `PeriodIcons` got an optional `size` (default 28, drawn at 20 here). `HomeV3Page` now exports `openRoot`, `useBangkokToday`, `Loaded` so the two pages share them.
- **Read only:** `#/n/meds` only calls `loadRoot`; demo links (`?demo=normal|nomember|nomeds|nohouse`, `&tab=house`, `&open=stopped|deleted`) call no storage at all. Today in demos = `DEMO_TODAY`.
- **Rules reused, not re-written:** days left / low stock = `daysLeft`, `isLowStock`, `formatDaysLeft`, `unitFor`; house status = `houseStatus`; expiry = `expiryStatus` with the settings (low <= 14 days, expiry <= 15 days). Cream / drops with tubes say "สำรอง N หลอด/ขวด" (no days).
- **Decided on my own (the board / brief does not say):**
  1. Own medicine that is expired: red chip "หมดอายุแล้ว" + line "หมดอายุ <date>"; days left = 0 gives red chip "หมด". An expired medicine is not counted by the order button.
  2. House item: expired beats out beats low beats expiring (same order as Home care card). The order button counts out + low only.
  3. Filter "ใกล้หมด" keeps low and out; "ใกล้หมดอายุ" keeps expiring and expired. Tab counts ignore the filter; member header counts only the matching rows. Members with no matching row are hidden.
  4. Stopped / deleted sections: sorted newest first; hidden while a filter or search is on. Stopped date = the latest `stop` event.
  5. "เหลือ" is put before days / weeks (`เหลือ 14 วัน`, `เหลือประมาณ 5 สัปดาห์`); "ไม่พอสำหรับวันนี้", "ยังไม่ได้นับ" are shown as they are.
  6. (Changed after review) Filter chips and the search button are hidden in the three empty states (no member / no own medicine / no house medicine), as the board says (`showChips` / `showSearchBtn` = not an empty state). "ไม่พบยาที่ตรงกัน" keeps both so the filter can be cleared. The two tabs stay in every state.
  6b. Home shortcut "รายการยา" is a real link to `#/n/meds` (same card, no badge); the other shortcuts stay coming-soon. Tab names on the list are 15px x `--fs`, line 22px (board).
  7. Deleted house section uses the existing `delete` icon (board gives none). Floating "เพิ่มยา" is a ComingSoon, so it shows the word "เร็ว ๆ นี้" inside the button.
  8. Period icons: one icon per period of the medicine (not only the first). Interval schedules say "ทุก N ชั่วโมง · 1 เม็ด".
  9. House kind picture = the owner's guess: 44px round #E4F0FE circle with the 28px SVG inside (the board uses a round photo that could not be fetched).
- **Row and member head are not pressable in 5a** (detail pages = PR 5b, member page does not exist). No arrow either.
- **check:overflow** now also visits 8 meds-list routes (real data, 4 demos, house tab, both folded sections open).

## M4 PR 5b — medicine detail v3 (30 ต.ค. 2569)

What was built: route `#/n/meds/:id` (outside DataProvider), `medActions.ts` (stop / resume, pure), `medDetail.ts` (screen model + refill preview), `houseDetail.ts` (house sheet), `Sheet` / `Toast` / `sheetParts` components, house-medicine sheets on the list, own-medicine rows are links, demo houses `cream | notdaily | stopped`.

### Owner's decisions (from the PR brief)
- `STOP_REASONS` = 5 (หมอสั่ง, แพ้ยา, ใช้ยาไม่ได้ / ผลข้างเคียง, ยาหมดไม่ซื้อต่อ, อื่น ๆ). Stored value keeps the old spelling; the screen text comes from `STOP_REASON_LABEL` (หมอสั่งหยุด, ..., อื่นๆ). Stop note: required for อื่น ๆ (schema refine, spaces only fails), optional "symptom" for แพ้ยา / ใช้ยาไม่ได้, none for the others. Nothing is written into `allergies` (PR 10).
- `RESUME_REASONS` = 4; `reason` is optional in the schema so old data and backups still pass; the screen always forces a choice.
- Refill and "open a new tube" reuse `refillStock` / `openNewTube`; no MedEvent. Stop / resume never touch stock, expiry or schedule.
- Creams / drops: big number "สำรอง N หลอด/ขวด", no days line, "ไม่ตัดสต็อกอัตโนมัติ".
- The "เร็ว ๆ นี้" badge is gone from the bottom menu.

### Decided on my own
1. **ComingSoon is now a pressable button for every use** (not only the two nav tabs): faded, `aria-disabled="true"`, no word inside; pressing shows the floating "เร็ว ๆ นี้" (role="status", 3 s). The brief said the other uses "keep the text as a floating message", so Home and list buttons lost their inline badge too. `badgeClassName` is still accepted and ignored (Home still passes it; the unused badge CSS classes in `HomeV3.module.css` are left, Home was not edited). Tests of Home / list / V3Nav / ComingSoon updated.
2. **Adjust reason text:** `doctor` = "เหตุผล: หมอสั่ง"; `self_or_other` = "เหตุผล: ปรับเองหรือไม่ใช่หมอสั่ง" (my guess, as the brief said).
3. **Days in the stock card:** "ประมาณ N วัน" for daily medicines (the board's text; `formatDaysLeft` itself says "N วัน", used unchanged in the refill summary "26 วัน → 41 วัน"). Weeks come from `formatDaysLeft` as is.
4. **Cream / drops chip:** เพียงพอ when spare > 0, ใกล้หมด when spare = 0 but a tube is open, หมด when nothing at all (the owner's rule). The list page still shows "ปกติ" for every tube medicine (`isLowStock` has no tube rule) — not changed, listed in HANDOFF.
5. **Medicine never counted (stock = null):** big text "ยังไม่ได้นับ", hint "ใส่จำนวนยาที่มีเมื่อเติมสต็อก", no chip, refill allowed (counting then starts from the amount added). Stopped + never counted: no hint.
6. **Stopped medicine quantity:** shown as of today with paused days skipped (`stockNow` on an "active copy"), chip / days / buttons hidden.
7. **Pack text:** "N กล่อง + N แผง + N เม็ด" only for box / strip / sachetBox packs (sachet box = "กล่อง"); a medicine with no pack shows only the big number. Zero left = "ไม่มียาเหลือ".
8. **Dose rows:** days text = ทุกวัน / วันเว้นวัน / เฉพาะวันจันทร์ พุธ ...; interval = one row "ทุก N ชั่วโมง" with "1 เม็ด · เริ่ม 08:00 น. · ต่อเนื่อง|N วัน". The interval row uses the noon icon.
9. **Drops wording:** "กำลังใช้ขวดที่เปิดอยู่ / ยังไม่ได้เปิดขวด" (the brief only gives the หลอด text).
10. **Refill sheet:** liquid = มล.; sachetBox = กล่อง + ซอง; no pack = one box. Typed values must be numbers (digits, optional decimals); `refillStock` decides everything else and its Thai error is shown under the boxes. Expiry sentence without any date: "ยาตัวนี้ยังไม่มีวันหมดอายุ ถ้าใส่วันที่ จะใช้วันที่ของกล่องใหม่".
11. **Date choice:** a label styled as a button with the browser's `<input type="date">` lying on it, invisible (tap opens the phone's picker); shows the Thai date after; "ล้าง" clears.
12. **House items do have an expiry field** (`houseItemSchema.expiry`), so the sheet always shows the "วันหมดอายุ" row ("ไม่ได้ระบุ" when empty) and the refill sheet always has the optional date. House refill adds to `stock.qty` (decimals allowed) and keeps the nearer expiry (`mergeExpiry`).
13. **House sheet status chip** uses `houseStatus` (ปกติ / ใกล้หมด / หมดแล้ว), not the expiry-first chip of the list row; expiry gets its own chip in the sheet. Kind names: ยาเม็ด, แคปซูล, ยาน้ำ, ครีม, ผงชงดื่ม (sachet), ยาหยอด, อื่นๆ.
14. **Header icon** of the detail page is the "nav-medicines" capsule (the list header has the logo, which the detail page must not have). Card icons: rx-medicine, prepare-meds, restock, history (existing files).
15. **Demo:** the VitaminD of dad now has a 3x10 box pack, 5 strips + 3 pills = 53 pills, expiry 2027-03-15, and all four event kinds; Brintellix (stopped) is stopped for แพ้ยา / ผื่นคัน with 10 pills left. Extra demo houses: `cream` (a9), `notdaily` (a10, Mon / Wed / Fri). The list demo `normal` keeps its 6 + 2 rows.
16. **Demo wording:** the banner says "โหมดตัวอย่าง ไม่บันทึกข้อมูล" (same as Home and list).
17. Test helper in `stock.test.ts` got a note on its `อื่น ๆ` stop event (the new schema rule).
18. Toast sits 84px above the bottom (over the menu on list pages); it is drawn in `<body>` with literal colours.


## M4 PR 6a — add member v3 + add-member buttons + cream chip fix (31 ต.ค. 2569)

What was built: route `#/n/members/new` (outside DataProvider; `MemberFormPage.tsx`, `MemberFormV3.tsx` = `MemberForm` (takes starting values, PR 9 will reuse it) + `MemberFormView`), `src/domain/v3/members.ts` (create member, birth year, colour, duplicate name, draft state), `tubeLevel` in `stock.ts` (one rule for cream / drops, used by the list and the detail page), real links for "เพิ่มสมาชิก".

### Decided on my own
1. **Colour:** first colour of `PERSON_COLORS` that no active member uses; when all four are used, `PERSON_COLORS[activeCount % 4]`. The Home / list demos hard-code their colours (no rule to copy), so this is new. Members taken out do not count.
2. **"ตัวฉัน":** limited to one active member (the schema already says so). Chip is disabled (faded) with the line "มี 'ตัวฉัน' แล้ว"; a taken-out "ตัวฉัน" does not block.
3. **Switch default:** on for "ตัวฉัน", off otherwise; follows the relation until the user touches the switch once.
4. **Birth year:** same rule and same clock as `personSchema` (`maxBirthYearBE` is now exported from `schema.ts`). The box keeps digits only (max 4). The error shows as soon as the text is not a valid year (also while typing the first digits).
5. **Same name:** compared without spaces and case, active members only; warning only.
6. **No insurance card, no "take out" button** (PR 10 / PR 9). New members have no `coverage`, `allergies = unknown`.
7. **Reason sentence** above the save button (also shown on a new page): "พิมพ์ชื่อและเลือกความสัมพันธ์ก่อน" / "พิมพ์ชื่อก่อน" / "เลือกความสัมพันธ์ก่อน" / "แก้ปีเกิดให้ถูกต้องก่อน" / "ชื่อยาวเกิน 40 ตัวอักษร". The save bar is `position: sticky` at the bottom of the page.
8. **After saving:** the sheet cannot be closed with the curtain or Esc. "เพิ่มยาให้ {ชื่อ}" is a ComingSoon until PR 6b (drawn with the tint style, because a faded label on solid blue was unreadable). "กลับหน้าหลัก" is a link to `#/n` (keeps `?demo=` only for Home's own demo names).
9. **Back arrow:** `history.back()` when `history.length > 1`, otherwise `#/n`.
10. **Demo names:** the page accepts the list demos (normal, nomember, nomeds, nohouse, cream ...) and Home's (empty0, empty1 ...). `&sheet=done` in a demo shows a made-up member ("คุณแม่"); on real data it is ignored.
11. **Home start card step 1 and the "+" cell of the members card** are links (`#/n/members/new` + `?demo=` in a demo); the step button uses the tint style (it used to be faded). The list's "no member" button is a link. Not linked: bottom-menu "สมาชิก" and "จัดการ" (PR 9).
12. **Cream / drops chip (list):** same rule as the detail page via `tubeLevel`: spare > 0 = ปกติ (detail: เพียงพอ), no spare but open = ใกล้หมด, none = หมด. Needs-order count, the "ใกล้หมด" filter and the order button include them; an expired one stays "หมดอายุแล้ว" and is not counted. `isLowStock` itself is unchanged, so Home's care card still does not treat tubes as low.
13. `defaultNewId` of `medActions.ts` is exported and used for the member id.

## M4 PR 6b — add medicine v3 + add-medicine buttons (31 ต.ค. 2569)

What was built: route `#/n/meds/new` (outside DataProvider, checked before `V3_MED_PATH`; `AddMedPage.tsx` = data and way back, `AddMedV3.tsx` = screen, `AddMedV3.module.css`), `src/domain/v3/addMedicine.ts` (every rule: suggestions, finders, form → Schedule / Pack / Stock, `addPersonalMedication`, `addHouseItem`, texts), schema additions (bottle pack, house item strength, dose size by kind), real links for "เพิ่มยา" in four places. The table "form → data" is the owner's (brief, section C) and was not changed.

### Differences from the brief and conflicts with the real code
1. **Branch name.** The session was told to work on `claude/m4-pr6b-add-medicine-tfyn1d`, not `m4/pr6b-add-medicine`; I used the first.
2. **Liquid dose rule vs "old data still passes".** Rule A3 (a liquid dose must be a multiple of 2.5, 2.5–100) makes the made-up data of PR 1 invalid: a liquid with a dose of 1 (`sampleRootV3` a3, and the Home demo `notoday`). I changed those two made-up doses to 5 ml. A saved `judya.v3` or a backup file that holds a liquid with a dose that is not a multiple of 2.5 will be refused by `rootSchema` from now on. Nothing real is in `judya.v3` yet (the main app still uses `judya.v2` until PR 7), so I kept the rule as written. The same rule also stops any non-liquid dose above 4 (as before).
3. **`stockText.ts` has no "แผง" word,** so nothing changed there. The word now comes from `packWord()` in `schema.ts` ('แผง' / 'กล่อง' for a sachet box / 'ขวด' for a bottle) and is used by the detail page's "1 ขวด + 3 เม็ด" line, the refill sheet's boxes, and the refill error of `stock.ts`.

### Decided on my own
1. **Cream / drops: "ขวด" is also a tube stock.** Choices are ไม่นับสต็อก / หลอด / ขวด for both; all three use `tubes` (N total → opened = N ≥ 1, spare = N − 1). Default: cream หลอด, drops ขวด. The house unit is หลอด or ขวด by choice (drops always ขวด).
2. **Existing medicine with pack `none`** (e.g. a tablet counted loose): the count boxes are one box "เม็ด", stock = `count{strips 0, loose}`. Cream / drops with pack none: tubes. Kind, strength and pack of a reused medicine are never changed; the form's kind switches to the old one when "เพิ่มให้ … ด้วย" is pressed.
3. **Match with a suggestion list open.** The "มีในบ้านแล้ว" card shows only when the suggestion list is closed (brief). If the only suggestion is exactly the typed name, the list is treated as closed, so typing a full name shows the card at once. The match is by name only (spaces and case ignored); a different strength with the same name is "the same medicine" until the user presses "ไม่ใช่ตัวเดียวกัน? เพิ่มเป็นยาใหม่". That choice is kept for that exact name only (change the name and it asks again).
4. **Count boxes** (all optional): whole numbers, except loose tablet / capsule pills (multiples of 0.5) and ml of a liquid (decimals). A text that is not a number, or a not-allowed fraction, shows a red message and stops saving. Sizes: whole numbers above 0, except ml per bottle (decimals) and the optional amount of a tube / bottle of cream or drops (decimals; if typed it must be above 0). Numbers above 99,999 are refused.
5. **Switching "ซื้อมาเป็นอะไร"** keeps the typed counts and clears the pack sizes; switching the kind resets stock and schedule and keeps the name.
6. **Total for a liquid in bottles** needs the ml per bottle; until it is typed, the red field and the yellow box say so and no total is shown. Liquid / pills "ไม่นับสต็อก" → pack none, stock null. House total in the smallest unit: pills (boxes × strips × pills + strips × pills + loose), ml, sachets, pieces, or tubes (N). House items never get `lowAt`.
7. **Dose screen.** Per-period card holds the meal chips (not for bedtime, not for cream / drops) and the stepper; the stepper's − and + are 48px and stop at the rules (tablet / capsule / other 0.5–4, sachet 1–4, liquid 2.5–100). The spoon buttons set the dose (not add to it). Liquid text uses plain decimals ("7.5 มล."); the "½" form is for pills only. The yellow box shows over 30 ml; the confirm sheet comes once, when saving.
8. **Interval first time** is a native time box (default 08:00); a course of days starts today. Frequency "วันเว้นวัน" anchors on today.
9. **Step indicator.** Passed steps are solid blue with the number (no tick), the current one has a ring and bold blue text, later ones are white with a grey ring (contrast ≥ 4.5:1). The list has `aria-label="ขั้นที่ N จาก M"` and `aria-current="step"`.
10. **Bottom bar:** reason sentence, main button, and a text button "ย้อนกลับ" on steps 2 and 3 (the header arrow does the same). On step 3 the grey reason is short ("กรอกช่องที่ขาดให้ครบ แล้วค่อยกดบันทึก"); the full sentence with the field name is in a yellow box under the cards. Selected period chips use the light-blue style (a solid blue chip hid the blue morning icon).
11. **Back / save in a demo.** A Home demo name (empty0, empty1 …) is carried to the nearest list demo when going on to the list (empty0 → nomember, empty1 → nomeds, others → normal); the member link keeps the original name. A member added in a demo is not in the add-medicine demo (each page builds its own demo house).
12. **"ดูยาเดิม"** opens `#/n/meds?tab=house&item=<id>` (the sheet of that house medicine), as in the brief.
13. **Expiry date** accepts any date (also in the past, which then shows as expired in the list), same as the refill sheets.
14. **Name rules** count characters, not bytes (2–60, trimmed). Strength: empty or a number above 0.

### Seen, not changed
- Home and the list write a liquid dose with `formatAmount`, so 7.5 ml reads "7½ มล." there (the form says "7.5 มล.").
- A cream with the stand-in dose 1 reads "… · 1 ครั้ง" on Home and the list (`unitWord` for cream), as the existing demo cream already did.
- The list's "ใกล้หมด" and Home's care card still do not treat tube medicines as low (unchanged since PR 6a).
- Allergy check when adding a medicine → PR 10. Edit medicine, dose adjustment → PR 8.
