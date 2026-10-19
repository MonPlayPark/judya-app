# JudYa — handoff

Read `CLAUDE.md` and `docs/BRIEF.md` first. Update this file at the end of every session.

## Status after step 3.1 (16 ต.ค. 2569)

Step 3.1 "app skeleton" is merged to `main` (PR #2) and live.

### Done
- Vite + React 18 + TypeScript strict + Vitest + zod + vite-plugin-pwa in the repo root.
- `src/domain/calc.ts` — port of the old `calc.mjs`; `calc.test.ts` — the same 18 tests, all pass.
  (Source: `MonPlayPark/JudYa`, commit `8245a01`, read-only copy.)
- `src/domain/schema.ts` — zod schema of data v2 (BRIEF section 2). `emptyRoot()` gives a blank house.
- `src/domain/storage.ts` — key `judya.v2` only; validate → write → read back → validate → roll back on failure.
  11 storage tests + 7 schema tests.
- Theme from Design System tokens (`src/styles/tokens.css`), bundled Noto Sans Thai, hash router,
  4 blank tabs (หน้าแรก / ยา / สมาชิก / ตั้งค่า) + bottom menu (tap targets 56px, smallest text 15px).
- Manifest, icons (192, 512, maskable), offline service worker, "new version" bar.
- `.github/workflows/ci-deploy.yml`: test → build → deploy to Pages, deploy only on `main`.

### Checks run this session
- `npm test`: 41 tests pass. `npm run build`: passes (includes strict `tsc --noEmit`). No `any` in `src/`.
- Real browser (Playwright/Chromium, 360px wide): page opens, service worker installs, **reload and tab
  switching work with the network off**, no console errors, Thai font loads from the bundled file.
- Lighthouse 12 (local preview): Accessibility 100, Best-practices 100, Performance 100, SEO 100 (SEO was 90 before the
  meta description was added). Lighthouse 12 has no PWA score; installability is for the S24 test.

### Owner's S24 test (BRIEF 3.1 item 5): PASSED
PR #2 merged and deployed. On the S24 the owner confirmed: URL opens, "Add to home screen" works, the JudYa icon
shows, and the app opens in airplane mode. **Step 3.1 is accepted.**

## Owner's S24 test list for 3.1 (done, kept for reference)
1. Chrome → `https://monplaypark.github.io/judya-app/` — the page "หน้าแรก" with 4 menu items opens.
2. Chrome ⋮ → "เพิ่มลงหน้าจอหลัก" (Add to Home screen) / "ติดตั้งแอป" — it adds.
3. The JudYa icon (white bag on blue) appears on the home screen; the name under it is "JudYa".
4. Turn on airplane mode, close the app fully, open it from the icon — it still opens and the 4 menu items switch pages.
5. Look at the text: nothing tiny, menu easy to tap with a thumb.

Before step 1 works, GitHub Pages must be set to "Source: GitHub Actions" (BRIEF 3.5). If the deploy step fails
with a Pages error, that setting is the first thing to check.

## Status after step 3.2a-1 (17 ต.ค. 2569) — logic + data layer + sample data

PR #5 is **merged** to `main` (deployed). Home screen and "ยาวันนี้" were built in 3.2a-2 (below).

### Done
- `Snapshot` defined by the owner (O1) in BRIEF section 2; `schema.ts` enforces the per-event-type rules (start / adjust / edit /
  stop / resume) with tests.
- Pure logic in `src/domain/` (all with tests, the owner's hand-calculated examples a–i included, numbers not changed):
  `schedule.ts` (dosesOn, doseKey, intervalTimes, weekday conversion Monday=0 ↔ Sunday=0), `stock.ts` (stockNow, daysLeft,
  isLowStock, houseStatus), `today.ts` (todayInBangkok, todayDoses), `prep.ts` (tick / untick / prune 14 days),
  `expiryStatus` takes `warnDays`. The old calc functions and their 18 tests are untouched.
- Data layer: `actions.ts` (tickDose, untickDose, loadSample, clearSample; Root → Root), `sample.ts`, `meta.isSample`,
  `storage.startFresh` (copy to `judya.v2.prev`, then blank house), `src/state/DataContext.tsx` (loads once, saves through
  `saveRoot`), `persist.ts` (`navigator.storage.persist()` once per page load).
- Screens: problem page (corrupt / wrong-version / unavailable) with confirm box, "บันทึกไม่ได้ ข้อมูลเดิมยังอยู่" bar with retry,
  temporary home tab (empty card + "ลองดูด้วยข้อมูลตัวอย่าง" → "ข้อมูลตัวอย่างพร้อมแล้ว…" + "ลบข้อมูลตัวอย่าง").
- `npm test`: 113 tests pass. `npm run build` passes. Real browser (Playwright, 360px): sample appears, survives reload, can be
  deleted, corrupt page shows, no console errors, buttons 52px high.

### Owner's S24 test list for 3.2a-1 (after the PR is merged and deployed)
1. Open the app → home tab says "ยังไม่มีสมาชิกหรือยา" with the button "ลองดูด้วยข้อมูลตัวอย่าง".
2. Tap it → "ข้อมูลตัวอย่างพร้อมแล้ว: สมาชิก 2 คน ยา 4 รายการ".
3. Close the app fully and open it again → the sample message is still there.
4. Tap "ลบข้อมูลตัวอย่าง" → back to "ยังไม่มีสมาชิกหรือยา".
5. Turn on airplane mode, close the app, open from the icon → it still opens (and the sample works offline).

### Things the next session must know
- **O4** (adjust dose vs. stock count) and **O5** (real data added on top of sample data) in `docs/DECISIONS.md` — O5 must be
  solved in the first action that adds a member or medicine (clear `meta.isSample`); O4 before the adjust-dose screen (3.2b).
- Stock numbers: today is not deducted; days left walks the real schedule from today.

## Status after step 3.2a-2 (18 ต.ค. 2569) — home screen (S1) + "ยาวันนี้" (S2)

Branch `ccr-085d0f08-jmy885`, PR open (not merged).

### Done
- Logic with tests (owner's hand examples included, numbers unchanged): `domain/care.ts` (`careItems`, `memberCards`), `domain/format.ts`
  (`thaiDate`, `thaiDateShort`, `formatPills`), `todayProgress` and `intervalDay` in `domain/today.ts`.
- Clock: `getToday` on `DataProvider`/`App` (tests inject it), `state/useToday.ts` re-reads on visibility / focus / every minute.
- Screens: `pages/HomePage.tsx` (greeting, today card, care list, member cards, sample banner), `pages/TodayPage.tsx` (`#/today?who=`),
  shared `components/Card.tsx`. Ticks go through `actions.tickDose/untickDose` only (pruning of 14-day-old ticks is in `actions.tickDose`).
- Hidden-for-now list and all choices: `docs/DECISIONS.md` section "Step 3.2a-2".
- `npm test`: 167 pass. `npm run build` passes. Playwright 360px: no text under 15px, no tap target under 48px, no sideways scroll, no console errors.

### Owner's S24 test list for 3.2a-2 (after merge and deploy)
1. Open the app, tap "ลองดูด้วยข้อมูลตัวอย่าง": home shows greeting + date, a banner "นี่คือข้อมูลตัวอย่าง", the today card, "ยาที่ต้องดูแล", "สมาชิกในบ้าน".
2. Tap the today card → "ยาวันนี้". Tap a row: ring turns green with a tick and says "จัดแล้ว"; the top counter and "เหลืออีก N" change. Tap again: it unticks.
3. Close the app fully and reopen: the ticks are still there. Go back to home: the card shows the same count.
4. Tap the member chip: only that member's rows. Reopen via the back arrow: filter resets.
5. Leave the app open past midnight (Thai time), come back: the date is new and all rows are unticked.
6. Airplane mode: everything above still works.
7. Check the numbers by hand: "เหลือ N วัน" of each medicine in "ยาที่ต้องดูแล" (sample numbers are made up).

## Status after step 3.2a-3 (18 ต.ค. 2569) — fixes after the S24 test of PR #6

Branch `ccr-9976fdd5-9nagba`, PR open (not merged).

### Main bug ("5 rows but counter says 4, morning card twice") — NOT reproduced in code
- Real sample (`makeSample`, today = 2026-10-18, Sunday) rendered through the real app: jsdom test **and** real Chromium 360px on the
  production build both give 4 rows, counter "จัดแล้ว 0 จาก 4", cards เช้า / เย็น once each, no repeated ids or tick keys.
  The code cannot draw two "เช้า" cards from one list (one card per slot; rows and counter come from the same list `all`).
- The deployed build equals `main` (workflow run #10 on `39ee793` is green), so it is not a wrong deploy.
- Most likely cause (unproven): Android "scroll/long screenshot" stitching — the fixed bottom menu and a repeated slice of the page
  look like a duplicated card when the page is longer than the screen. In a Playwright full-page shot the menu also lands in the middle.
- Stored data was checked in theory: the old 3.2a-1 sample is the same `makeSample`; duplicates in storage would also raise the counter.
- Locked with tests (`src/App.sample.test.tsx`): unique ids/keys in the sample, rows = total, one card per time of day.
- Owner: please check on the S24 with the live eye (scroll, no long screenshot). If it still repeats, send a normal screenshot and tell
  the time on the phone; then add a visible build id in Settings (3.2d) to be sure which version runs.
  Note `registerType: 'prompt'`: a new build only runs after tapping the "new version" bar or closing the app fully.

### Small fixes (all with tests)
a. Home "ดูทั้งหมด": no "(อีก N รายการ)" when all prepared; N counts only unprepared doses. b. Status word never splits (`components/SubLine`).
c. "ถึงรอบซื้อเติมสต๊อก" is a plain heading. d. Member chips hidden with one member. e. ยา / สมาชิก / ตั้งค่า show "หน้านี้กำลังสร้าง" + back button
(was an empty page). Decisions in `docs/DECISIONS.md` "Step 3.2a-3".

### Checks
`npm test`: 175 pass. `npm run build` passes. Playwright 360px (sample, Sunday 18 ต.ค. 2569): `#/today` 4 rows / 4, no chips, no text under 15px,
no sideways scroll, no console errors; `#/` all done = "ดูทั้งหมด" only; the 3 blank tabs show the note and the button goes home.

## Status after step 3.2b-1 (18 ต.ค. 2569) — functions that change medicine data (no screens)

Branch `ccr-4cf532e7-4aq45a`, PR open (not merged). Only `src/domain/medicine.ts` + `medicine.test.ts` and docs changed; schema, DataContext and screens untouched.

### Functions (all `fn(root, …, ctx) → { ok: true, root, … } | { ok: false, error }`, `ctx = { today, nowIso, newId }`)
| Function | Input | Extra ok fields | Error codes the screen must turn into Thai |
|---|---|---|---|
| `findMedicationByName(root, name)` | name | returns `Medication \| undefined` | — |
| `addPerson(root, { name, relation, selfManaged }, ctx)` | | `personId` | `sample_present` `invalid_name` `invalid_relation` `invalid_data` |
| `addMedicine(root, { personId, name, unit, schedule, stockQty?, expiry?, note? }, ctx)` | | `assignmentId` `medicationId` `reusedMedication` | `sample_present` `person_not_found` `person_removed` `invalid_name` `invalid_unit` `invalid_schedule` `invalid_qty` `invalid_expiry` `invalid_note` `unit_mismatch` `duplicate` `invalid_data` |
| `adjustDose(root, id, { schedule, reason, note? }, ctx)` | | — | `assignment_not_found` `stopped` `reason_required` `invalid_note` `invalid_schedule` `no_change` `invalid_data` |
| `stopMedicine(root, id, { reason, note? }, ctx)` | | — | `assignment_not_found` `already_stopped` `reason_required` `invalid_note` `invalid_data` |
| `resumeMedicine(root, id, { note? }, ctx)` | | — | `assignment_not_found` `not_stopped` `invalid_note` `invalid_data` |
| `editMedicine(root, id, { name?, stockQty?, expiry?, note? }, ctx)` (`null` removes; left out = untouched) | | `sharedWith` | `assignment_not_found` `medication_not_found` `invalid_name` `invalid_qty` `invalid_expiry` `invalid_note` `name_taken` `no_change` `invalid_data` |

`invalid_data` should never be seen by the owner (means a bug); show a general "บันทึกไม่ได้" message.

### Rules the screens (3.2b-2) must follow
- On `sample_present`: ask the owner, then call `clearSample` and try again (never clear silently, O5). Only `addPerson` / `addMedicine` check this.
- After `editMedicine` with a new name and `sharedWith > 1`: warn that the name changes for everyone using the medicine (O6), ideally before saving.
- Adjust / stop / resume rebase the count to today (O4); edit's `stockQty` is a recount from the number shown today. The screen shows the number from `stockNow`, not the stored base.
- The reason list is `EVENT_REASONS` in `schema.ts`; adjust and stop must offer it and cannot save without one.
- Save the returned `root` through `DataContext` (`saveRoot` path); the functions never touch storage.

### Checks
- Owner's hand examples A–G are tests (numbers unchanged: A 14 → 10/6/2/0, wrong-if-not-rebased 4; B stop 10, resume 10 then 6; C 7; D shared medicine/rename/name_taken;
  E sample refusal then add; F invalid values; G schema-valid + events only appended). 29 new tests. Every ok result is checked with `rootSchema` and the old events are compared.
- `npm test`: 204 pass. `npm run build` passes. No `any`.

### Next: 3.2b-2 (add-medicine screens S4/S5/S5b + medicine detail S6), then 3.2c, 3.2d.

## Status after step 3.2b-2 (18 ต.ค. 2569) — screens for medicines

Branch `ccr-d4f6ddc2-2t2963`, PR open (not merged). Schema and the functions in `domain/medicine.ts` untouched.

### Done
- Data layer (`state/DataContext.tsx`): six methods wrapping the medicine functions; refused / failed-save results never show as done (tested).
- `domain/errorText.ts` (Thai text for every code, completeness test), `domain/scheduleForm.ts` (form <-> schedule, Monday-first days via `canvasDayToModelDay`, summaries), `domain/medView.ts` (badges, stock / expiry blocks, history), `domain/suggest.ts` (name suggestions, pluggable source).
- Screens: `#/meds`, `#/meds/new` -> `/schedule` -> `/stock` ("ขั้น N จาก 3", draft in memory), `#/meds/:id` (adjust, stop, resume, edit, history). Hidden-for-now list and every choice: `docs/DECISIONS.md` "Step 3.2b-2".
- `npm test`: 276 pass. `npm run build` passes. Playwright 360px (20 shots: list, 3 add steps, detail normal / adjust / edit / stop / stopped, empty house, sample box, refresh note, not found): no text under 15px, no tap target under 48px, no sideways scroll, no console errors.
- Owner's hand examples 1-5 are screen tests; numbers not changed (14 left / 7 days / low at the border of 7; adjust keeps 14; stop+resume deducts nothing; shared rename warns "2 คน"; จ. พ. ศ. = [1,3,5]).

### Owner's S24 test list for 3.2b-2 (after merge and deploy)
1. Blank house -> tab ยา: lead-in text + "เพิ่มยา". Add: name, "เพิ่มสมาชิก" (name, relation, switch), next, schedule (try meal and every-X-hours), next, count + unit + expiry, save -> "เพิ่มยาแล้ว".
2. "ไปที่ยาทั้งหมด": the medicine is under the member; open the home / ยาวันนี้: it shows (if the member is not "จัดยาเอง").
3. Detail: check "เหลือ N เม็ด · พอทาน N วัน (ถึง …)" by hand against your own count.
4. ปรับโดส: pick new amounts, reason, save: the count stays the same that day; history has the line.
5. หยุดยา with a reason: row moves to "ยาที่หยุดแล้ว", gone from ยาวันนี้; กลับมาใช้ยานี้อีก: back, stock unchanged by the stopped days.
6. With sample data on: ยา -> เพิ่มยา shows the box about deleting the sample first.
7. Airplane mode: all of the above works. Refresh in the middle of adding: polite note, back to step 1.

### Next: 3.2c (members), 3.2d (settings / backup), 3.3. The members page should replace the small add-member form in add-medicine step 1.

## Status after step 3.2d (18 ต.ค. 2569) — backup / restore + Settings page

Branch `ccr-6b69bc28-mtj3ua`, PR open (not merged). Schema untouched. Choices and the hidden list: `docs/DECISIONS.md` "Step 3.2d".

### Done
- `domain/backup.ts` (makeBackup, summarizeBackup, needsBackupWarning, backupAge; pure, tests = owner's hand examples 1-4), `storage.restoreRoot` (the only code that writes `judya.v2.prev` for a restore; both keys roll back on failure),
  `actions.setSettings` / `markBackedUp` (example 6), `errorText.ts` (restore + settings texts), `state/persist.ts` (status + second ask after first medicine), `state/backupFile.ts` (share sheet or download).
- Data layer: `replaceAll`, `markBackedUp`, `setSettings` on `DataContext` (screens never call saveRoot / restoreRoot / localStorage).
- Screens: `#/settings` (expiry days, low-stock days, backup, restore, storage promise, version + privacy line), quiet backup line on home, restore button on the problem screen (`components/RestorePanel.tsx`).
- `npm test`: 360 pass. `npm run build` passes. Playwright 360px on the production build: no text under 15px, no tap target under 48px, no sideways scroll, no console errors on home, settings, after-backup, restore error / summary, problem screen. Real flow in Chromium: backup (download path, no share sheet in desktop Chromium) -> clear localStorage -> restore -> data identical to the file; bad file leaves storage untouched.
- Not run: Web Share on a real phone (only mocked in tests). Not built: Settings shops / order template (3.3), members page (3.2c).

### Owner's S24 test list for 3.2d (after merge and deploy)
1. Tab ตั้งค่า: two day settings; tap a chip or − / +: the number changes at once, no save button; go home: "เตือนก่อนหมดอายุ N วัน" shows the new number.
2. Add a real medicine, then open Settings: the line says "ยังไม่เคยสำรอง" with a warning; home shows the quiet line with a link.
3. Tap "สำรองข้อมูล": the Android share sheet opens. Close it without choosing: it says "ยกเลิกแล้ว ยังไม่ได้สำรอง", date unchanged. Tap again and save to Drive / LINE Keep / Files: "แชร์ไฟล์ … แล้ว", date = today, warning and home line gone.
4. **Backup -> clear Chrome web data -> restore:** with that file saved, in Chrome clear this site's data (Settings > Site settings > JudYa > Clear & reset), open the app (blank house), Settings > "นำกลับจากไฟล์สำรอง", pick the file: the summary shows "สมาชิก N คน ยา M รายการ" and "จะแทนที่ข้อมูลปัจจุบันทั้งหมด"; confirm. Members, medicines, stock numbers, expiry dates and thresholds must be exactly as before.
5. Pick a wrong file (a photo or any non-backup file): a Thai message says the current data was not touched.
6. Storage: "เบราว์เซอร์รับปากจะไม่ลบข้อมูล" shows ใช่ / ไม่; if "ไม่", keep backing up.
7. Bottom of Settings: version with a short code; "แอพนี้ไม่ส่งข้อมูลออกนอกเครื่องยกเว้นคุณกดแชร์เอง".

### Next: 3.2c (members page; it replaces the small add-member form in add-medicine step 1), then 3.3 (shops, prices, order, house medicines, Settings shops + template).

## Status after step 3.2c (18 ต.ค. 2569) — members pages

Branch `ccr-fed68c89-4uxnvy`, PR open (not merged). Schema untouched. Choices and the hidden list: `docs/DECISIONS.md` "Step 3.2c".

### Done
- Logic (`domain/medicine.ts`, tests in `members.test.ts` = owner's hand examples 1-6): `editPerson`, `removePerson`, `restorePerson`, `checkBirthYear` (2400..this พ.ศ.), insurance rule, `nextPersonColor`; `addPerson` takes birth year / colour / insurance (old behaviour kept). `domain/memberView.ts`, `care.memberStock`. Data layer: `editPerson` / `removePerson` / `restorePerson`.
- Screens: `#/members`, `#/members/:id`, `#/members/new`, `#/members/:id/edit` (one form; remove + "นำกลับ"); the bottom tab "สมาชิก" is real.
- `npm test`: 437 pass. `npm run build` passes. Playwright 360px on the production build (3 members + 1 self-managed + 1 removed): list, one member, self-managed member, edit, edit with year error, remove box, new form, not found, removed-done card, home, today, medicines: no text under 15px, no tap target under 48px, no sideways scroll, no console errors.
- Every place that reads members already skipped removed members; proved by tests (today, home care list, member cards, medicines, detail). Numbers unchanged by remove + restore.

### Owner's S24 test list for 3.2c (after merge and deploy)
1. Tab สมาชิก: cards with "ยา N รายการ", "ทานวันนี้ N ครั้ง", "ใกล้หมด"/"สต๊อกพอ", "ยังไม่พบการแพ้ยา". A self-managed member says "จัดยาเอง · เราดูแลสต๊อก".
2. "เพิ่มสมาชิก": fill every box, save -> you land on that member's page; the member is in the list. Name empty -> save is off with the sentence.
3. Birth year: type 2570 (or 2399) and save -> a Thai message under the box and nothing is saved; 2569 saves.
4. Edit a member, save, open edit again: values are still there. Clear the birth year: it says "ยังไม่ระบุ".
5. "นำสมาชิกออก" -> box -> ยกเลิก changes nothing -> นำออก: "นำ… ออกแล้ว". Then check **ยาวันนี้, หน้าแรก, ยาทั้งหมด**: nothing of that member any more. Tab สมาชิก: section "สมาชิกที่นำออก" -> "นำกลับ": everything is back, medicine numbers the same (but stock days keep counting while the member is out, see DECISIONS).
6. Member page: medicine rows open the medicine page; "จัดยาวันนี้" opens ยาวันนี้; no "สั่งยา" / "แชร์" / "เพิ่มบันทึกแพ้ยา" buttons.
7. With sample data on: เพิ่มสมาชิก asks to delete the sample first.
8. Airplane mode: all of the above works.

### Next: 3.3 (shops, prices, order, house medicines, Settings shops + template), 3.4 (share summary).

## Status after step 3.3a (19 ต.ค. 2569) — house medicines + shops (no prices, no order)

Branch `ccr-cb7c2178-istwny`, PR open (not merged). Schema untouched (old backups restore; a test proves house items, shops and prices round-trip). Choices and open questions O7–O8: `docs/DECISIONS.md` "Step 3.3a".

### Done
- Logic with tests (the owner's hand examples are tests, numbers unchanged): `domain/house.ts`, `domain/shop.ts`, `domain/houseView.ts`, `domain/houseForm.ts`, eight actions in `domain/actions.ts` (addHouseItem, editHouseItem, cutHouseStock, removeHouseItem, restoreHouseItem, addShop, editShop, deleteShop), Thai error texts, `DataContext` methods. Screens never write storage.
- Screens: tab ยาสามัญประจำบ้าน (`#/meds?tab=house`), add (`#/house/new`), edit / cut / delete / bring back (`#/house/:id`), shops in Settings (list, form, delete confirm that says the prices go too), house rows on home open their page.
- `npm test`: all pass (566 before the new files were counted; run it for the current number). `npm run build` passes. Playwright 360px on the production build (tab, add, edit with notices, edit empty / out, Settings with the shop form open, home): no text under 15px, no tap target under 48px, no sideways scroll, no console errors.
- Not built (3.3b): prices per shop, order page, price comparison, LINE message, order-days field, order template. Nothing says "สั่งยา" anywhere. No schema change.

### Owner's S24 test list for 3.3a (test together at the end of 3.3)
1. ยา → tab "ยาสามัญประจำบ้าน" → "เพิ่มยาสามัญประจำบ้าน": name, quantity 10, unit, warn level 5, expiry date → บันทึก → "เพิ่ม … แล้ว". Back: it is in the tab with "สต๊อกพอ".
2. Open it, cut 3 → "ตัดออก 3 … แล้ว เหลือ 7". Raise the cut number above what is left (e.g. 8 of 7) → press → a warning, the quantity stays 7.
3. Cut to the warn level (7 → cut 2 → 5): the row says "ใกล้หมด" with a warning icon, and the home page "ยาที่ต้องดูแล" lists it; tap it → opens the page. Cut everything → "หมดแล้ว".
4. Put an expiry date in the past / within the warning days: "หมดอายุแล้ว" / "ใกล้หมดอายุ" on the row and on home.
5. ลบยานี้ → box → ยกเลิก changes nothing; ลบ → "ลบ … แล้ว" → นำกลับ → it is back with the same numbers. Gone from the tab and home while deleted.
6. ตั้งค่า → ร้านค้า → เพิ่มร้านค้า: name, phone (try "12": refused), ไปรับเองที่ร้าน / ให้ร้านส่ง with fee 0 and with a free-over amount (0 refused) → list shows the words. แก้ไข changes; ลบร้านนี้ shows the box "ราคาที่ใส่ไว้ของร้านนี้จะหายไปด้วย".
7. With sample data on: adding a house medicine or a shop asks to delete the sample first.
8. Airplane mode: everything works. Settings "เตือนยาใกล้หมด" stays whatever you set (code default is still 7).

### Next: 3.3b (prices per shop, order page, comparison, LINE message, order days, template), then 3.4.

## Next after 3.2b-1: 3.2b-2 screens, then 3.2c, 3.2d. (O5 solved: the functions refuse with `sample_present`; the screen clears the sample after asking.)
Open points from 3.1 still waiting: `settings.expiryWarnDays` must be passed to `expiryStatus` by every screen;
persist status line in Settings (3.2d); `judya.v2.prev` is now written by "เริ่มใหม่" (restore-from-backup in 3.2d will reuse it).

## Working notes
- Commands: `npm test`, `npm run build`, `npm run typecheck`, `npm run dev`. After `npm run build`, `npx vite preview --port 4173`
  serves the real offline build at `http://localhost:4173/judya-app/`.
- Tests use made-up data only (`src/domain/fixtures.ts`). Never put real names or medicines in this public repo.
- Component tests mock `virtual:pwa-register` (see `src/App.test.tsx`). Screen tests of the data layer: `src/App.data.test.tsx`
  (jsdom `localStorage`; spy on `Storage.prototype.setItem` to simulate a full disk).
- Do not touch other localStorage keys (`judya.v1`, `medmate.v1` share the origin).
