# JudYa — handoff

Read `CLAUDE.md` and `docs/BRIEF.md` first. Update this file at the end of every session.

## M4 PR 11.1 — order data and rules, domain only (1 พ.ย. 2569)

Branch `m4-pr11-order` (draft PR). Domain only; the app looks exactly the same. Details and the points to check: `docs/DECISIONS.md` "M4 PR 11.1".

### Status
`npm test` 762 pass (684 before); `npm run build` passes. No file in `pages/`, `components/`, `App.tsx`, `HomeV3.tsx` changed; only `judya.v3` / `judya.v3.prev` are used.

### What is there now
- `schema.ts`: order line source `med { medicationId, shares[] }`; order has `shopName`, `shippingFee?`, `closedAt?`; new reference check (medication, share -> assignment of that medication). Order `shopId` is no longer checked (a shop can be deleted; the order keeps its name).
- `prices.ts`: `upsertPrice`, `latestPrice`, `latestPriceAnyShop`, `checkEnteredPrice`.
- `orderLines.ts`: `buildOrderLines` (auto list, tubes, shares), `makeFreeLine`, `findNameClash`.
- `orderCompare.ts`: `compareShops` (counts only priced lines, delivery, free-over, unit conversion).

### Left for later (do not start before the owner says)
- 11.2: the order page and "สั่งแล้ว" (build the stored order from `DraftLine`s, rebuild `shares` if the owner changes a quantity, store `shopName` and `shippingFee`).
- Receiving: split received stock by shares, tubes fewer than people, kind `other` not updated, never-counted warning. Rules are written in DECISIONS.
- Wire the Home buttons (two "coming soon" spots in `HomeV3.tsx`).

### Waiting for the owner
Two questions at the end of DECISIONS "M4 PR 11.1" (order of shops with missing prices; stricter unit rule for house medicines).


## M4 PR 7b — v2 is gone (1 พ.ย. 2569)

Branch `ccr-1ee8bdd6-ct7h60`. All v2 code is deleted (137 files); the app is v3 only. Every unknown route opens v3 Home. The `v3theme` values now live in `:root` of `src/styles/tokens.css` and the `.v3theme` class is gone. Nothing deletes the owner's old v2 key (it just stays in the phone). The full list of what was kept, what was deleted and why: `docs/DECISIONS.md` "M4 PR 7b".

### Status
`npm test` 684 pass; `npm run build` passes; `npm run check:overflow` 684 checks at 360 / 412px and 3 font sizes, 0 problems. 360px pictures of 13 v3 pages at two font sizes (26 images) are pixel-identical before and after.

### Left for later PRs
- Order page (PR 11–12): rewrite the order logic against the v3 `Root`; the v2 code is in git (`git show e36c6d3:src/domain/order.ts`). `domain/format.ts` and `domain/shop.ts` are kept for it.
- Bottom menu "สมาชิก" and the settings list are still "coming soon" (PR 9, PR 14).

### Owner's S24 test (after merge and deploy)
1. Open the Chrome link: if you see the old build, tap "โหลดใหม่" once. Then v3 Home opens as before.
2. Walk through Home, รายการยา, a medicine, เพิ่มสมาชิก, เพิ่มยา, ตั้งค่า → ข้อมูลและสำรองข้อมูล: nothing should look different from before.
3. An old link such as `…/judya-app/#/meds` now opens Home (the old pages do not exist any more).


## M4 PR 7 — the entry switches to v3 (31 ต.ค. 2569)

Branch `ccr-3b57d00d-32devm` (the session fixed the name). `#/` and the empty app open v3 Home; `#/n/...` stays. When `judya.v3` cannot be read, every v3 page shows "เริ่มใหม่" (2 confirm steps, old text kept in `judya.v3.prev`) and "กู้คืนจากไฟล์สำรอง" (the PR 6c restore, now shared through `restoreFlow.tsx`). The "new version" bar is now on v3 pages. Details: `docs/DECISIONS.md` "M4 PR 7".

### Status
`npm test` 1,558 pass; `npm run build` passes; `npm run check:overflow` 864 checks at 360 / 412px and 3 font sizes, 0 problems (includes the new screen and both sheets). Real-Chromium cache check: see DECISIONS "PWA / cache". New code never touches another key (tested by spying on every storage call).

### Waiting for the owner
- After the deploy, the first open of the Chrome link may still show the OLD app (cached) with the blue bar "มีเวอร์ชันใหม่ · โหลดใหม่": tap it once. Same after every later deploy.
- (Solved in the PR 7 fix) v3 pages now ask the browser to keep the data: once when a v3 page opens and once more after the first medicine is saved (`V3Frame`, `AddMedPage`).
- Nothing reads `judya.v3.prev` yet except being a safety copy (no "undo" button).

### Left for later PRs

### Owner's S24 test (after merge and deploy)
1. Open the Chrome link with no `#`: if you see the old app, tap "โหลดใหม่"; then v3 Home opens ("สวัสดีค่ะ", menu: หน้าหลัก / รายการยา / ตั้งค่า).
2. Unreadable data can only be seen with broken data, so it is covered by tests; do not break your data on purpose.

## M4 PR 6c — data and backup page v3 (31 ต.ค. 2569)

Branch `ccr-c05dae34-qet8go` (asked for `m4/pr6c-backup-page`; the session fixed the first name). New page `#/n/settings/data` ("ข้อมูลและสำรองข้อมูล"): status card, back-up button (share sheet, else download), restore from a .json file with a confirm sheet, storage promise, footer. Ways in: the Settings tab of `V3Nav` (now a link, temporary until PR 14) and the backup reminder on Home (a link when it is the first warning). Logic: `src/domain/v3/dataPage.ts`; `backup.ts`, `storage.ts` and the schema are unchanged. Settings are not in the file and a restore does not overwrite them. Details and my own decisions: `docs/DECISIONS.md` "M4 PR 6c".

### Status
`npm test` 1,518 (1,464 before) pass; `npm run build` passes; `npm run check:overflow` 798 checks (726 before), 0 problems (11 new routes at 360 / 412px and 3 font sizes). Looked at 360px pictures from the real build (old backup + error, confirm sheet, Home reminder).

### Waiting for the owner
- Stored data that cannot be read: this page shows only the problem line, no restore (DECISIONS item 2). Do you want restore offered there, or left to PR 7?
- Settings stay out of the file (DECISIONS item 1): confirm this is what you meant.

### Left for later PRs
- The Settings tab becomes the list of 5 groups, and this page becomes one of them → PR 14. Switch to the new app, and "start fresh" for unreadable data → PR 7. Nothing in the app reads `judya.v3.prev` yet.

### Owner's S24 test (after merge and deploy)
Add `#` links to the Pages address. Nothing is saved in a demo; the back-up and restore buttons are faded there and say so.
- `#/n/settings/data?demo=normal` (recent backup, no warning), `?demo=backup` (never backed up), `?demo=normal&backup=old` (yellow 14-day warning), `?demo=nomeds`.
- Restore errors: `?demo=normal&error=not_json`, `&error=wrong_version`, `&error=invalid`, `&error=too_big`, `&error=save_failed`; confirm sheet: `?demo=normal&sheet=confirm`.
- Real run (no `?demo=`), after you add a test member and medicine: Settings tab → "สำรองข้อมูล" → send the file to yourself; "ไม่ส่ง" (close the share sheet) must not change the date. Then "นำกลับจากไฟล์สำรอง" → pick the file → read the sheet → "ยกเลิก" changes nothing; "นำกลับ" replaces the data. A v2 file (`judya-backup-…` without `-v3`) must say "เวอร์ชันเก่า". Home `#/n?demo=backup`: the reminder line is underlined and opens this page.

## M4 PR 6b — add medicine v3 (31 ต.ค. 2569)

Branch `claude/m4-pr6b-add-medicine-tfyn1d` (asked for `m4/pr6b-add-medicine`; the session fixed the first name). New page `#/n/meds/new` (personal medicine 3 steps, house medicine 2 steps, "เพิ่มให้ … ด้วย" for a medicine already in the house); `addMedicine.ts` domain; schema: bottle pack, house item strength, dose size by kind; "เพิ่มยา" buttons linked (list FAB + empty cards, Home start card step 2, sheet after adding a member with `?person=`). Details and my own decisions: `docs/DECISIONS.md` "M4 PR 6b".

### Status
`npm test`, `npm run build` and `npm run check:overflow` pass (726 checks, 0 problems: add-medicine step 1 / 2 / 3 in every state, at 360 / 412px, 3 font sizes). Looked at 390 and 360px pictures from the real build (new, found in house, same house name, schedule, liquid, box not filled, cream); they are not committed.

### Left for later PRs
- Edit medicine data, dose adjustment (`adjust` events), "แก้ข้อมูลยา" → PR 8. Allergy of a member and the allergy warning when adding a medicine → PR 10. Switch to the new app → PR 7.
- Seen, not changed: Home / list show 7.5 ml as "7½ มล."; cream shows "1 ครั้ง"; tubes are not "low" on Home.
- Old liquid data with a dose that is not a multiple of 2.5 is refused by the schema now (nothing real is stored yet).

### Owner's S24 test (after merge and deploy)
Add `#` links to the Pages address. Nothing is saved in a demo.
- Blank form: `#/n/meds/new?demo=normal`
- Already in the house (Metformin is used by คุณพ่อ; คุณพ่อ is greyed): `#/n/meds/new?demo=normal&name=Metformin`
- Liquid dose: `#/n/meds/new?demo=normal&person=p2&name=ยาน้ำทดสอบ&kind=liquid&step=2` (press + until over 30 มล. → yellow box, then ถัดไป, บันทึกยา → confirm sheet)
- Cream: `#/n/meds/new?demo=normal&person=p2&name=ครีมทดสอบ&kind=cream&step=2`
- House medicine: `#/n/meds/new?demo=normal&type=house&name=ยาสามัญใหม่`
- Same house name (ยาธาตุน้ำขาว): `#/n/meds/new?demo=normal&type=house&name=ยาธาตุน้ำขาว`
Buttons: list page "+ เพิ่มยา" (house tab asks for the house type), Home `#/n?demo=empty1` step 2, `#/n/meds?demo=nomeds`, and "เพิ่มยาให้ …" after adding a member.

## M4 PR 6a — add member v3 (31 ต.ค. 2569)

Branch `m4/pr6a-add-member`. New page `#/n/members/new` (3 cards, sticky save bar, no bottom menu, picture sheet, sheet after saving); `members.ts` domain; "เพิ่มสมาชิก" buttons linked (Home start card + "+" cell, list "no member"), demo carried by `?demo=`; list chip for cream / drops now uses the owner's rule (`tubeLevel`, shared with the detail page). Details and my own decisions: `docs/DECISIONS.md` "M4 PR 6a".

### Status
`npm test` 1,371 (1,306 before) pass; `npm run build` passes; `npm run check:overflow` 450 checks, 0 problems (new routes + typed states of the form at 360 / 412px, 3 font sizes). Looked at 390 and 360px pictures from the real build: empty, filled, wrong year, picture sheet, sheet after saving, "ตัวฉัน" taken + same-name warning, list with cream / low / out.

### Left for later PRs
- Insurance / allergy data of a member → PR 10. Member list page, edit member (reuse `MemberForm` with `initial`), bottom-menu "สมาชิก", "จัดการ" → PR 9.
- "เพิ่มยาให้ {ชื่อ}" of the sheet → PR 6b (ComingSoon now).
- Seen, not changed: Home's care card still ignores tubes (`isLowStock`).

### Owner's S24 test (after merge and deploy)
`#/n/members/new?demo=nomember` (empty: save is grey with the reason; type a name, pick ญาติ, birth year 2503 → "อายุ N ปี"; 2399 → red message), `?demo=normal` (type คุณพ่อ → same-name warning, still saves), `&sheet=avatars` (12 pictures), `&sheet=done` (sheet after saving). Press "เพิ่มสมาชิกอีกคน" after choosing ตัวฉัน → the ตัวฉัน chip is faded. Home `#/n?demo=empty0` → "เพิ่มสมาชิก" opens the page; `#/n/meds?demo=nomember` too. Nothing is saved in a demo.

## M4 PR 5b — medicine detail v3 (30 ต.ค. 2569)

Branch `m4/pr5b-med-detail`. New page `#/n/meds/:id` (4 cards, no tabs, no bottom menu); sheets: refill, stop, resume, full history; "open a new tube" is immediate; own-medicine rows and stopped-fold rows on the list are links; house rows open a sheet (details, refill). `ComingSoon` is now a pressable faded button that shows a floating "เร็ว ๆ นี้" (badge removed everywhere, bottom menu is shorter). Schema: 5 stop reasons, `RESUME_REASONS`, `อื่น ๆ` needs a note. Details and my own decisions: `docs/DECISIONS.md` "M4 PR 5b".

### Status
`npm test` 1,306 (1,234 before) pass; `npm run build` passes; `npm run check:overflow` 366 checks, 0 problems (14 new routes at 360 / 412px and 3 font sizes). Looked at 390 and 360px pictures from the real build: normal, cream, stopped, notdaily, refill, stop, resume, history, house sheet, house refill.

### Waiting for the owner
See "ต่างจากบอร์ด / ตัดสินเอง" in the PR. Main points: ComingSoon badge removed from Home and list buttons too; adjust-reason wording; "ประมาณ N วัน"; cream chip rule differs from the list (list says "ปกติ" for tubes).

### Left for later PRs
- Reason "แพ้ยา" is NOT written into the member's `allergies` yet → PR 10.
- "ราคาตามร้าน" card of the board: not built → PR 13.
- Edit-data page, edit (⋯) button, "แก้ข้อมูลยา" of the house sheet, dose adjustment (`adjust` events have no screen) → PR 8. All are ComingSoon now.
- Seen, not changed: the list shows chip "ปกติ" for creams / drops even with no spare tube (the detail page follows the owner's rule); unused badge classes in `HomeV3.module.css`; `--color-header-spark` still unused.

### Owner's S24 test (after merge and deploy)
Open the GitHub Pages link plus:
1. `#/n/meds/a4?demo=normal` — VitaminD of dad: 53 เม็ด (1 กล่อง + 2 แผง + 3 เม็ด), ประมาณ 26 วัน, หมดอายุ 15 มี.ค. 2570, history shows 3 + "ดูทั้งหมด (4)". Press เติมสต็อก, type 30 in เม็ด: 53 → 83 and 26 → 41 วัน; บันทึก (nothing is saved in a demo; reload = back to start). Press หยุดยานี้: save stays grey until a reason is chosen; try อื่นๆ.
2. `#/n/meds/a9?demo=cream` — สำรอง 2 หลอด, no days; เปิดหลอดใหม่ twice (second time the button turns grey).
3. `#/n/meds/a7?demo=stopped` — หยุดแล้ว, "แพ้ยา · อาการ: ผื่นคัน", no stock buttons; กลับมากินใหม่ → pick a reason.
4. `#/n/meds/a10?demo=notdaily` — time left in สัปดาห์.
5. Sheets by link: add `&sheet=refill|stop|history` (a4) or `&sheet=resume` (a7).
6. List `#/n/meds?demo=normal`: rows have ">" and open the detail; back arrow returns to the demo list. `&tab=house&item=h3` opens the house sheet, `&item=h3&sheet=refill` its refill.
7. Bottom menu: no word under สมาชิก / ตั้งค่า; press one → black floating "เร็ว ๆ นี้".

## M4 PR 5a — Home fixes + medicine list v3 (30 ต.ค. 2569)

Branch `m4/pr5a-meds-list`. Item 0 (sparkles removed, v3 tap target 44px, CLAUDE.md line, docs), V3Nav `current` with real links, new route `#/n/meds` (read only), `medsList.ts` model, demo houses, `KindIcon`, `check:overflow` limit 43.5px for v3 only. Schema: house item has an optional `kind` (owner chose A). Details and my own decisions: `docs/DECISIONS.md`, "PR 5a".

### Status
`npm test` 1,234 (1,181 before) pass; `npm run build` passes; `npm run check:overflow` 282 checks, 0 problems. Looked at 360px pictures of the own-medicine tab (stopped section open) and the house tab.

### Waiting for the owner
See "ต่างจากบอร์ด" in the PR: house kind picture is a guess (round circle + SVG), "(40 เม็ด)" of paracetamol is not shown (house stock has no pack size), "เร็ว ๆ นี้" shows inside the floating add button, expired medicine chip. Rows and member heads are not pressable yet (PR 5b).

### Owner's S24 test (after merge and deploy)
Open `#/n/meds?demo=normal`: two tabs with counts, dad has 2 yellow "ใกล้หมด" chips and a disabled order button, mom's Atorvastatin shows "ใกล้หมดอายุ 5 พ.ย. 69"; fold "ยาที่หยุดแล้ว (2)" opens. `&tab=house`: five rows, worst first, kind pictures. Also `?demo=nomember`, `nomeds`, `nohouse&tab=house`. Home: no sparkle strokes near the mascot; bottom menu "รายการยา" is a real link.

## M4 PR 4d — v3 theme sync (30 ต.ค. 2569)

Branch `m4/pr4d-v3-theme`. Look only: no structure, text or logic change. New `src/styles/v3theme.css` (`.v3theme`: board colours, shadows, `--fs`) + `v3theme.test.ts`; `HomeV3.module.css` and `V3Nav.module.css` now use the board's px sizes x `var(--fs)`, spacing and radii; `HomeV3.tsx` adds the class `v3theme` on the root and a few modifier classes. `:root` in `tokens.css`, `src/domain`, `icons.tsx` and all v2 files untouched (`git diff` of them is empty). Rules and deviations: `docs/DECISIONS.md` "M4 PR 4d"; the board-vs-code table is in the PR description.

### Status
`npm test`: 1,142 before, 1,181 after (39 new, all in `v3theme.test.ts`); `npm run build` passes; `npm run check:overflow` 234 checks, 0 problems. Chromium 360 and 390px, `demo=normal` and `demo=alert`: computed styles equal the board (page #F6FAFF, header #EAF3FF / 184px, greeting 26/35 navy, tick button #006DF5 88px, row 58px, divider #E3E8EF, card radius 16px).

### Waiting for the owner
See "พบแต่ไม่ได้แก้" in the PR (calendar icon in the date pill, chevrons, 4th tile "ตารางยา", start-card pictures, tap target 44 vs 48, headline touches the sparkles at 360px).

### Owner's S24 test (after merge and deploy)
Open the GitHub Pages link + `#/n?demo=normal` (and `alert`): pale-blue page, light-blue header with two soft clouds, "สวัสดีค่ะ" navy, white cards with rounded corners, blue "จัดแล้ว" pill, grey-outlined "รอจัด" pill, the chosen member has a blue ring. Try text size ปกติ / กลาง / ใหญ่ in Settings of the old app (`#/settings`) and come back: Home grows with it, nothing cut. The old app at `#/` must look exactly as before.

## M4 PR 4c — period icons + navy greeting (30 ต.ค. 2569)

Branch `m4/pr4c-period-icons`. Small PR, no layout or logic change. The 4 period icons on the Home "ยาของวันนี้" card are now copied as-is from the locked board (canvas v87) into `src/components/v3/PeriodIcons.tsx` (`MorningIcon`, `NoonIcon`, `EveningIcon`, `NightIcon`); `HomeV3.tsx` uses them; the period colour classes and the `.rowIcon` colour were removed from `HomeV3.module.css`. "สวัสดีค่ะ" is `var(--color-navy)`. Details and the contrast report: `docs/DECISIONS.md` "M4 PR 4c".

### Status
`npm test`: 1,134 before, 1,142 after (8 new, in `HomeV3.test.tsx`); `npm run build` passes; `npm run check:overflow` 234 checks, 0 problems. Chromium 360px shots of `normal` and `alert`, all 4 icons seen on the sample members.

### Owner's S24 test (after merge and deploy)
Open the GitHub Pages link + `#/n?demo=normal`: morning = blue sun behind a cloud, evening = orange setting sun, "สวัสดีค่ะ" dark navy. Tap the other members to see noon = yellow sun and bedtime = navy moon. Rows are the same height as before.

## M4 PR 4b — brand swap (30 ต.ค. 2569)

Branch `m4/pr4b-brand`. Home v3 now shows `judya-mark.svg` (mark only) before "สวัสดีค่ะ" and the clipboard mascot `pharmacist-clipboard.svg`; favicon = `judya-mark.svg`; token `--color-navy`. Choices and the open point: `docs/DECISIONS.md` "M4 PR 4b".

### Status
`npm test`: 1,134 before, 1,134 after (no new test; `visual.test.ts` count 48 -> 49); `npm run build` passes; `npm run check:overflow` 234 checks, 0 problems. Chromium 360px shots of `normal` and `empty0`: both images loaded and inside the band, nothing cut.

### Waiting for the owner
Nothing. (Update from PR 4c: the four app-icon PNGs — 192, 512, maskable, apple-touch — were updated in PR #28, merged.)

### Owner's S24 test (after merge and deploy)
Open the GitHub Pages link + `#/n?demo=normal` (and `#/n?demo=empty0`): small blue mark before "สวัสดีค่ะ", mascot holding a clipboard on the right, not cut. Browser tab icon = the mark. Home-screen icon: new PNGs came with PR #28 (merged).

## M4 PR 4 — Home v3 (29 ต.ค. 2569)

Branch `m4/pr4-home`. First UI of v3, at `#/n` (the old home at `#/` is untouched). New: `src/domain/v3/home.ts`, `homeDemo.ts`, `src/pages/v3/HomeV3.tsx|HomeV3Page.tsx|css`, `src/components/v3/ComingSoon`, `V3Nav` + tests. Edited: `src/App.tsx` (the `#/n` route), `scripts/check-overflow.mjs` (7 v3 routes, text >= 14px and tap target >= 48px checks), docs. All choices: `docs/DECISIONS.md` "M4 PR 4".

### Status
`npm test`: 1,073 before, 1,134 after (61 new: 31 logic, 30 screen); `npm run build` passes; `npm run check:overflow` 234 page checks, 0 problems (360 and 412px, 3 font sizes). Screenshots at 360px of all six states were taken with Chromium and looked at; the mockup picture was compared by eye (differences in DECISIONS). Not checked on a real phone.

### Next
Every place that says "เร็ว ๆ นี้" is a `<ComingSoon>`; a later PR swaps it for a real button or link (PR 5 list, PR 6-9 add, PR 12 order, etc.).

### Owner's S24 test (after merge and deploy)
Open the GitHub Pages link of the repo + `#/n?demo=normal` (also `alert`, `empty0`, `empty1`, `notoday`, `backup`). Check: badge "โหมดตัวอย่าง ไม่บันทึกข้อมูล"; tap a member to switch; tap "รอจัด" / "จัดแล้ว" (changes until you reload, nothing saved); grey places say "เร็ว ๆ นี้" and do nothing; no "ตารางยา" anywhere. `#/n` alone is the real v3 data (new user = empty state S0). The old app at `#/` works as before.

## M4 PR 3 — data: backup / restore v3, cross-table checks, weeks rounding (29 ต.ค. 2569)

Branch `m4/pr3-backup-v3`. Data only, no UI. New: `src/domain/v3/backup.ts`, `backup.test.ts`, `schemaRefs.test.ts`. Edited v3 files: `schema.ts` (cross-table rule), `stockText.ts` (weeks round down) and the PR 1–2 tests that depended on them. v2 files, `src/pages`, `src/components`, `src/App.tsx` and old v2 tests untouched (`git diff --name-only origin/main` lists only `src/domain/v3/*` and `docs/*`).

### Status
Done for PR 3. `npm test`: 1,010 before, 1,073 after (63 new: 38 backup, 25 cross-table; the weeks tests were changed in place); `npm run build` passes. All choices are in `docs/DECISIONS.md` ("M4 PR 3").

### What it does
- Weeks round down: 14 → "ไม่ถึง 2 สัปดาห์", 15 / 20 → "ประมาณ 2 สัปดาห์", 21 / 26 → "ประมาณ 3 สัปดาห์".
- The data is refused when a row points to something that does not exist (assignment → medicine / person, event → assignment, price → shop / item, order → shop / line source) or an id is used twice in one table. Removed people can still be pointed to.
- Backup file = v3 data as JSON, named `judya-backup-<date>-v3.json`. `summarizeBackup` gives `not_json`, `wrong_version` (a v2 file), `invalid` or `too_big` (over 5 MB). Restore uses `restoreRoot` (old data goes to `judya.v3.prev`). Round-trip test: back up → wipe → restore returns every table unchanged.
- Home banner functions: "ยังไม่ได้สำรองข้อมูล" when there are medicines and no backup; "ไม่ได้สำรองข้อมูลมา N วันแล้ว" after 14 days; otherwise nothing.

### Waiting for the owner
- Keep the "more than 14 days" backup reminder, or only "never backed up"?
- Should the sample house hide the "never backed up" banner? (As written, it shows.)
- Still open from PR 2: low-stock rule for cream / drops, ml range for liquid doses.

### Next
PR 4 — Home screen (uses `backupBanner`).

### Owner's S24 test for PR 3
No UI in this PR. Just open the app and see that the old app works as before.

## M4 PR 2 — data: stock / days left / weeks / refill logic (28 ต.ค. 2569)

Branch `m4/pr2-stock-logic`. Data only, no UI. New in `src/domain/v3/`: `schedule.ts` (units per day), `stock.ts` (units, stockNow, daysLeft, targetDoses, isLowStock, houseStatus, refillStock, openNewTube), `stockText.ts` (days / weeks texts), a test file for each, and `schemaStock.test.ts`. `schema.ts` got the rule "stock must fit the medicine kind" (+ count with strips needs a pack with a strip size). v2 files, `src/pages`, `src/components`, `src/App.tsx` and old tests untouched (`git diff --stat origin/main` shows only `src/domain/v3/*` and `docs/*`).

### Status
Done for PR 2. `npm test`: 933 before, 1010 after (77 new: 11 worked examples with hand calculations in `stock.test.ts`); `npm run build` passes. All choices and open points are in `docs/DECISIONS.md` ("M4 PR 2").

### Waiting for the owner
- Low-stock rule for cream / drops (now never low).
- Liquid dose range (schedule `pills` max 4 cannot hold a 5 ml dose).
- Weeks: nearest (used) or floor (M4-GAP)?
- Proposed Thai texts (see DECISIONS) for tubes / error / 0 days.

### Next
PR 3 — backup / restore v3 (`version: 3`).

### Owner's S24 test for PR 2
No UI in this PR. Just open the app and see that the old app works as before.

## M4 PR 1 — data: schema v3 + storage key + fixtures (28 ต.ค. 2569)

Branch `m4/pr1-schema-v3`. Data only, no UI. New files under `src/domain/v3/`: `schema.ts`, `storage.ts`, `fixtures.ts` and a test file each for schema and storage. v2 files, `src/pages`, `src/components`, `src/App.tsx` and old tests untouched (checked with `git diff --stat origin/main`). CLAUDE.md now allows `judya.v3` / `judya.v3.prev` for v3 code, and points to `docs/M4-GAP.md`.

### Status
Done for PR 1. `npm test`: 887 before, 933 after (46 new: 32 schema, 14 storage); `npm run build` passes. More numbers and all choices made on the way are in `docs/DECISIONS.md` ("M4 PR 1").

### Waiting for the owner
- Stop reasons list: check against the board "MedDetailStop" (v2's 4 reasons are used for now).
- Should a removed "ตัวฉัน" still count toward the "only one" rule? (now: no)
- Keep `unit` on Medication or derive from `kind`? (now: optional)

### Next
PR 2 — stock / days / weeks logic (M4-GAP section 5). The v3 backup file (`version: 3`, PR 3) is not written yet.

### Owner's S24 test for PR 1
No UI in this PR, so nothing to test on the phone. Just open the app and see that the old app works as before.

## Working notes
- Commands: `npm test`, `npm run build`, `npm run typecheck`, `npm run check:overflow`, `npm run dev`. After `npm run build`, `npx vite preview --port 4173`
  serves the real offline build at `http://localhost:4173/judya-app/`.
- Tests use made-up data only (`src/domain/v3/fixtures.ts`). Never put real names or medicines in this public repo.
- Component tests mock `virtual:pwa-register` (see `src/App.test.tsx`). Screen tests drive `<App />` through jsdom `localStorage`.
- Do not touch other localStorage keys: v3 code uses `judya.v3` and `judya.v3.prev` only (plus the font-size key of `prefs/fontSize.ts`).
- Spec and plan: `docs/M4-GAP.md` (gap table, v3 schema, PR plan, owner questions Q1–Q14).
