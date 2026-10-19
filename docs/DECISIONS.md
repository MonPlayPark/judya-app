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
