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

## Next: step 3.2b (add medicine + medicine detail), then 3.2c, 3.2d. Add-data actions must clear `meta.isSample` (O5).
Open points from 3.1 still waiting: `settings.expiryWarnDays` must be passed to `expiryStatus` by every screen;
persist status line in Settings (3.2d); `judya.v2.prev` is now written by "เริ่มใหม่" (restore-from-backup in 3.2d will reuse it).

## Working notes
- Commands: `npm test`, `npm run build`, `npm run typecheck`, `npm run dev`. After `npm run build`, `npx vite preview --port 4173`
  serves the real offline build at `http://localhost:4173/judya-app/`.
- Tests use made-up data only (`src/domain/fixtures.ts`). Never put real names or medicines in this public repo.
- Component tests mock `virtual:pwa-register` (see `src/App.test.tsx`). Screen tests of the data layer: `src/App.data.test.tsx`
  (jsdom `localStorage`; spy on `Storage.prototype.setItem` to simulate a full disk).
- Do not touch other localStorage keys (`judya.v1`, `medmate.v1` share the origin).
