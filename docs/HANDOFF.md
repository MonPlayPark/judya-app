# JudYa — handoff

Read `CLAUDE.md` and `docs/BRIEF.md` first. Update this file at the end of every session.

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

Branch `m4/pr1-schema-v3`. Data only, no UI. New files under `src/domain/v3/`: `schema.ts`, `storage.ts`, `fixtures.ts` and a test file each for schema and storage. v2 files, `src/pages`, `src/components`, `src/App.tsx` and old tests untouched (checked with `git diff --stat origin/main`). CLAUDE.md now allows `judya.v3` / `judya.v3.prev` for v3 code, keeps `judya.v2` off limits until PR 7b, and points to `docs/M4-GAP.md`.

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

## Step V2 — home screen, mockup round 9 screens 1-3 (21 ต.ค. 2569)

Branch `claude/homepage-v2-mockup-r9-s6keiw`. Look only: `src/domain/**`, `src/state/**`, `judya.v2` untouched; nothing new is written to storage. The mockup was read from the branch of PR #20 (`docs/design/mockup-r9-reference.html`), which was not merged yet when this was built.

### Done
- `HomePage.tsx` + CSS rewritten for three states: during the day (screen 1), all done (screen 2, green band, mascot `ok`), first run with no medicine (screen 3, mascot `pill`). Flat band with mascot `wave` standing on its bottom edge; ring 96px; cards "ยาวันนี้", "ยาที่ต้องดูแล", "สมาชิกในบ้าน"; button "เพิ่มยา".
- "ยาที่ต้องดูแล": one list sorted by urgency (expired, then fewest days), member name on every row, day number as coloured text without a chip, expired = "เลิกใช้", button "สั่งยา" ("ไปสั่งยา" when all done), link "ดูทั้งหมด N".
- Member rows: avatar (n-th member = `avatar-0n`, wraps after 12, `avatarForIndex` in `src/visual.ts`), name, "ยา N รายการ", chevron, no status chip. Ring colour = the member's own colour; gray uses `--color-border-strong`.
- Bottom nav uses the new icons (`nav-*`), active tab has a ring and bold label.
- Tokens: ring size 96px, ring number 28/32, `--mascot-hero`, `--mascot-done` (round 9 values).

### Checks
`npm test` 885 passed (same count; 17 tests had their expected home text changed, listed in `docs/DECISIONS.md`). `npm run build` passes. `npm run check:overflow`: 192 page checks, 0 problems. App size 1,251,679 B (dist), over the 1 MB goal (O5).

### Owner's S24 test list for V2
Home looks like mockup screens 1, 2, 3 (blank house = first run; sample data = screen 1; tick everything on "ยาวันนี้" = screen 2) · mascot stands on the bottom edge of the band and is not inside a member card · text readable at all 3 font sizes · tap "สั่งยา", "เพิ่มยา", a care row, a member row, the "ยาวันนี้" card, bottom nav · avatar of the 4th member (gray) has a grey ring.

### Also in this PR
Default font size is now "ปกติ" (O4); CLAUDE.md minimum text line changed to 14px at normal; Settings has the "ขนาดตัวอักษร" card (first card; the other Settings cards are untouched, V5). S24: tap each size and see the whole app change, close and reopen the app and the size stays.

### Next
V3 medicines list, add, detail.

## Step V1 — visual refresh foundation (21 ต.ค. 2569)

Branch `ccr-216f9d24-7b2o75` (look only; no screen changed; `src/domain/**`, `src/state/**`, `judya.v2` and old logic tests untouched). Spec: `docs/design/visual-refresh-spec.md`.

### Done
- Image helper `src/visual.ts` (typed unions: 28 icons, 12 avatars, 8 mascot poses; `.svg`). The `.webp` files are still in the repo (nothing imports them); delete them in V1b if the owner agrees.
- Tokens in `src/styles/tokens.css` (colours, weights, type scale, layout, image sizes, ring); existing sizes converted to rem.
- Font size: `data-fs` n/m/l = 93/100/115%, `src/prefs/fontSize.ts` (read, write, apply, init, `useFontSize`), key `judya.fontsize`, default **m** (open question O4 in `docs/DECISIONS.md`). Settings card is V5.
- Zoom lock, all five items: viewport meta, `touch-action` / `overscroll-behavior-y`, `user-select` only on button/nav/h1-h3, inputs ≥ 16px, manifest `standalone` + `portrait`.
- Tests: 9 new (6 font size, 3 image helper). `npm run check:overflow`: 192 page checks (2 widths × 3 sizes × empty + sample house, all routes), 0 problems.

### Open for the owner
O4 default font size, O5 app size (1.19 MiB with all images used, goal 1 MB), O6 gray member ring colour. See `docs/DECISIONS.md`.

### Owner's S24 test list for V1
Install/open the new version, then: two-finger pinch does not zoom · double-tap does not zoom · pull down at the top of a page does not refresh · long-press selects and copies text (prescription text, the LINE order message, inside input fields) · normal scrolling works · tapping into an input does not zoom the page.

### Next
V1b (swap to SVG, delete WebP), V2 home. Font-size card in V5.

## Step V0 — vector images added (21 ต.ค. 2569)

Branch `assets/vector-svg` adds the 48 SVG files next to the WebP files in `src/assets/visual/` (same names). Images only: nothing imports them, no change to `src/domain/**`, `src/state/**` or tests.
Checks done: 48 of 48 names present; icons/avatars <= 12.2 KB, mascot <= 33.3 KB; no gradients, no embedded raster, no scripts or external links; looks the same as the WebP at 24/56 px.
Next: V1 wires images in (WebP is fine until V1b), V1b switches to SVG and deletes the WebP files.

## Step A0 — visual refresh images (20 ต.ค. 2569)

Branch `assets/visual-refresh` adds 48 WebP images in `src/assets/visual/` (28 icons, 12 avatars, 8 mascot poses; about 0.4 MB).
Images only: nothing imports them yet, no code, no `src/domain/**` or `src/state/**` change. Step V1 wires them in.
They will be swapped for SVG later (step V1b, same file names). See `src/assets/visual/README.md`.

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

## Status after step 3.3b-1 (19 ต.ค. 2569) — order logic + prices + data layer (no screens)

Branch `ccr-c619ff02-9al1jn`, PR open (not merged). Schema untouched (old backups restore; tests prove shops / prices / the new settings go through a backup file). Choices: `docs/DECISIONS.md` "Step 3.3b-1".

### Done
- `domain/price.ts` `validatePrice`; `domain/actions.ts` `setPrice`, `deletePrice`, `setSettings` with `orderDays` (7–90) and `orderTemplate`; `domain/stock.ts` `targetDoses`; `domain/order.ts` `orderLines(root, today)` and `compareShops(lines, shops, prices, includeShipping)`; `domain/orderMessage.ts` `DEFAULT_ORDER_TEMPLATE`, `orderLineText`, `messageLines`, `buildOrderMessage`.
- Data layer: `DataContext.setPrice`, `deletePrice`, `setSettings` with the new fields (a save that fails returns `save_failed` and memory + disk keep the old data). Thai texts for every new code (`errorText.ts`, `settingsErrorText`), completeness tests.
- The owner's hand examples A, B, C, W, H, the 7-days/14-days case, the shop comparison (ก 650, ข 840/800, ค 810, ง 650, จ missing `house:Y`), the cents case (0.1 + 0.2 = 0.3), the ceil edges (60 → 1, 60.5 → 2) and the exact message texts are tests. Numbers not changed.
- The old `compareShops` / `lineCost` / `purchasePlan` in `calc.ts` and their 18 tests are untouched and not imported.
- `npm test`: 684 pass (566 before, +118). `npm run build` passes (strict type check). No `any`. No screen was added, no button shown or hidden, no other localStorage key touched.

### What 3.3b-2 (screens) must know
- Build the order page from `orderLines(root, today)`; keep the owner's +/− as a local `qty` per line; pass the ticked lines to `compareShops`. Show a "missing price" link per key in `missing` (`med:<id>` → medicine page, `house:<id>` → `#/house/:id`).
- The message: `row = comparison.rows[0] ?? null` (or the shop the owner picked), then `buildOrderMessage(settings.orderTemplate, row?.shopName ?? null, messageLines(lines, row))`. Empty string = nothing ticked.
- Regular medicine price form must ask "1 {sell unit} = how many {unit}" and pass `perSellUnit`; a house price form passes none.
- `setPrice` on a sample house: refuses a NEW price with `sample_present` (ask to clear the sample first, as for shops); `deletePrice` takes the price id.
- Settings fields: `setSettings({ orderDays })` (error `invalid_order_days`), `setSettings({ orderTemplate })` (any text, empty = default).
- Open product points from the DECISIONS list that the owner may want to see on screen: a line with qty 0 stays listed but unticked; `buyMore` is shown whatever the shipping switch says.

### Owner test on the S24
Nothing in this step: no screen changed. The whole 3.3 (3.3a + 3.3b) is tested together at the end of 3.3b-2.

## Status after step 3.3b-2 (19 ต.ค. 2569) — screens: prices per shop, order days + message text, deleted house medicines

Branch `ccr-b85f36da-fzu3w7`, PR open (not merged). Schema untouched; no new localStorage key. Choices: `docs/DECISIONS.md` "Step 3.3b-2".

### Done
- "ราคาตามร้าน" on `#/meds/:id` (shared-price sentence when 2+ active users) and `#/house/:id` (`components/PriceSection.tsx`, logic in `domain/priceView.ts`; saving only through `DataContext.setPrice` / `deletePrice`).
- Settings: "จำนวนวันที่สั่งยา" (7–90) and "ข้อความสั่งยาไปร้าน" (box + save, default text, live preview from `buildOrderMessage`).
- House tab: fold-away "ยาสามัญที่ลบแล้ว (N)" with "นำกลับ".
- `npm test`: 745 pass (684 before, +61; 4 old "is hidden" assertions updated, listed in DECISIONS). `npm run build` passes. No `any`. Playwright 360px on the production build (medicine page with 2 users, price form with errors, house page + form, Settings, deleted list open): no text under 15px, no tap target under 48px, no sideways scroll, no console errors.
- Still hidden: the order page and every "สั่งยา" button / link (3.3b-3), share summary (3.4).

### Owner's S24 test list for 3.3b-2 (test together at the end of 3.3b-3)
1. Settings → ร้านค้า: add 2 shops. ยา → a medicine → "ราคาตามร้าน": "ใส่ราคา" for shop 1: 290, กล่อง, "1 กล่อง มีกี่ เม็ด" 60 → row says "฿290 ต่อ 1 กล่อง (60 เม็ด)". Try price 0, and leave "มีกี่" empty: red messages, nothing saved. Change 290 → 300: still one row. "ลบราคานี้" asks first.
2. Same medicine used by 2 members: both pages say "ราคานี้ใช้ร่วมกับทุกคนที่ใช้ยานี้ (2 คน)" and show the same prices. With 1 user (or one member taken out): no sentence.
3. ยาสามัญ → open one → "ราคาตามร้าน": 35 per ขวด → "฿35 ต่อ 1 ขวด"; no "มีกี่" box. Delete a shop that has prices: its prices go from both pages.
4. Settings: จำนวนวันที่สั่งยา: chips / − / +, stops at 7 and 90, no save button.
5. Settings → ข้อความสั่งยาไปร้าน: box shows the default text; the preview is the 5 lines "สวัสดีค่ะ ร้านตัวอย่าง … ขอบคุณค่ะ". Edit → preview changes, "บันทึกข้อความ" → "บันทึกแล้ว", leave and return: text is kept. "ใช้ข้อความตั้งต้น" + save returns to the default. Try the buttons "ใส่ {ร้าน}" / "ใส่ {รายการ}".
6. ยาสามัญ → delete one → tab "ยาสามัญที่ลบแล้ว (1)" → open → "นำกลับ": it is back with the same numbers and the price you put before.
7. Nothing says "สั่งยา" as a button or link anywhere. Airplane mode: all works.

### Next: 3.3b-3 (order page `#/order`, price comparison, LINE message, open the hidden "สั่งยา" buttons), then 3.4.

## Status after step 3.3b-3 (19 ต.ค. 2569) — order page + the "สั่งยา" buttons (end of 3.3)

Branch `ccr-6a77acfd-7mikxv`, PR open (not merged). Schema, `order.ts`, `orderMessage.ts`, `price.ts` untouched; the page writes nothing to storage. Choices: `docs/DECISIONS.md` "Step 3.3b-3".

### Done
- `domain/orderPage.ts` (`stepQty`, `effectiveLines`, `pickShop`) + `orderPage.test.ts` (26 tests, owner's examples A–D). Example data: `domain/orderExample.test-util.ts`.
- `pages/OrderPage.tsx` (+ css): list with tick / − / + / reason word, shop comparison with the shipping switch, shops missing a price (links), message (shown only), copy / open LINE / call, the three empty states and "nothing ticked". `App.order.test.tsx` (33 tests) covers A–H, copy, phone, empty states, no storage writes.
- Buttons "สั่งยา" opened on home, member page, all medicines (both tabs).
- `npm test`: 808 pass. `npm run build` passes (strict). Playwright 360px on the production build (A, B +, B −, C with / without shipping, D, copy note, E, nothing to order, no shops): no console errors, no sideways scroll, no text under 15px, no tap target under 48px; totals and messages equal the owner's numbers.
- Not done: 3.4 (share summary to the doctor).

### Owner's S24 test list for ALL of 3.3 — back up first (Settings → สำรองข้อมูล)
Lists of 3.3a and 3.3b-2 above still apply (house medicines, shops, prices per shop, order days, message text, deleted list). New for 3.3b-3:
1. Home: the blue "สั่งยา N รายการ" button is there (just "สั่งยา" when nothing is listed); tap → page "สั่งยา". Same from a member page (two buttons, whole house) and from ยา (link under both tabs).
2. With 2 shops priced for a low medicine and a low house medicine: both are listed ticked with "ใกล้หมด". Check the totals by hand; "ถูกที่สุด" is on the first shop; tap another shop → "สั่งร้านนี้" moves and the message names it.
3. + / − on a regular medicine move by one box of the chosen shop ("= N กล่อง (กล่องละ … เม็ด)"); − stops at one box. With no shop priced they move by one pill.
4. Switch "รวมค่าส่ง" off / on: totals change, "ซื้อเพิ่มอีก ฿… ส่งฟรี" stays.
5. Untick a medicine: shops that lacked its price join. A shop without a price is under "ร้านที่ยังไม่มีราคาครบ"; the medicine name opens its page to add the price.
6. Unknown stock: "ไม่ทราบสต๊อก", not ticked. Enough stock: "ของที่มีอยู่พอแล้ว…", cannot be ticked until + is pressed.
7. "คัดลอกข้อความ" → "คัดลอกแล้ว"; paste in LINE: text right, no member name. "เปิด LINE" opens LINE with the text. "โทรหาร้าน" opens the dial pad (only if the shop has a phone).
8. Leave and come back: the page starts again from the list; nothing is saved.
9. Airplane mode: the page works.

## Status after step 3.4 (20 ต.ค. 2569) — share the medicine summary to the doctor (S14)

Branch `ccr-90ea778c-arymwy`, PR open (not merged). Schema untouched, nothing written to storage, nothing sent over the network. Choices: `docs/DECISIONS.md` "Step 3.4".

### Done
- `domain/doctorSummary.ts` (`doctorSummary`, `summaryText`, `changeLine`, `imageBlocks`, `paginate`) + 30 tests = the owner's hand examples (today 2026-10-20; order จี, บี, เอ, เอช, เอฟ; stopped 71 / 90 days shown, 91 not; 4 adjusts keep 3; resume; removed member -> null; paginate examples). Example house: `domain/doctorExample.test-util.ts`.
- `components/summaryImage.ts` (all canvas code, `renderSummaryImages` never throws) + wrap tests; `state/shareImages.ts`; `pages/SharePage.tsx` (+css), route in `App.tsx`, third quick button "แชร์ให้แพทย์" on the member page.
- Tests: `App.share.test.tsx` (20 screen tests, picture maker mocked because jsdom has no canvas). One old test turned around: `App.members.test.tsx` (the "hidden" list no longer has แชร์ให้แพทย์).
- Real browser check (Playwright / Chromium 360px, production build, made-up data, PNGs saved and looked at): owner example -> **3 pictures** (หน้า 1/3, 2/3, 3/3); 12 medicines with long names, 4 time slots and 3 changes each (worst case) -> **12 pictures**; 12 ordinary medicines -> **4 pictures** (2-3 medicines per picture). Thai letters, tone marks and vowels correct, nothing outside the edges, every picture has the allergy line and the "จดโดยเจ้าของแอพ" line, a 40-letter name wraps in the header. Page at 360px: no sideways scroll, no text under 15px, no tap target under 48px, no console errors.
- Not run: Web Share on a real phone (mocked only).

### Owner's S24 test list for 3.4 (after merge and deploy)
1. Member page -> "แชร์ให้แพทย์": "กำลังสร้างภาพ…" then the pictures appear (number of pages = หน้า i/n), the yellow warning, the text box.
2. Look at a picture at full size: Thai letters right (tone marks above letters), nothing cut at the edges, allergy line + "จดโดยเจ้าของแอพ ไม่ใช่เวชระเบียน…" at the bottom of every picture, no "ไม่แพ้".
3. Check the facts against the app: medicine names, how taken now, start day, last dose changes (newest first, max 3), stopped medicines (only last 90 days).
4. "แชร์ภาพ": the Android share sheet opens -> choose LINE -> send to yourself / a trusted person: all pictures arrive, readable on the phone. Close the sheet instead: "ยกเลิกการแชร์แล้ว", no error.
5. "คัดลอกข้อความ" -> "คัดลอกแล้ว" -> paste in LINE: same text as the box. "เปิด LINE" opens LINE with the text.
6. Member with no medicine: "ยังไม่มียาให้สรุป", no buttons. Airplane mode: pictures and text still work.

### Next: 3.5 (7 days of real use). Still hidden: "สรุปพบแพทย์", add-allergy button.

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
- M4-0 done (25 ต.ค. 2569): gap review only, no code changed. See `docs/M4-GAP.md` (spec vs code table, v3 schema proposal, 15-PR plan, owner questions Q1–Q14).
