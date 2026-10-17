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

Branch `ccr-a1307fb4-8nuvcp`, PR open (not merged). Home screen and "ยาวันนี้" screen are **not** built yet (that is 3.2a-2).

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

## Next: step 3.2a-2 (home screen + "ยาวันนี้" screen using the logic above), then 3.2b, c, d
Open points from 3.1 still waiting: `settings.expiryWarnDays` must be passed to `expiryStatus` by every screen;
persist status line in Settings (3.2d); `judya.v2.prev` is now written by "เริ่มใหม่" (restore-from-backup in 3.2d will reuse it).

## Working notes
- Commands: `npm test`, `npm run build`, `npm run typecheck`, `npm run dev`. After `npm run build`, `npx vite preview --port 4173`
  serves the real offline build at `http://localhost:4173/judya-app/`.
- Tests use made-up data only (`src/domain/fixtures.ts`). Never put real names or medicines in this public repo.
- Component tests mock `virtual:pwa-register` (see `src/App.test.tsx`). Screen tests of the data layer: `src/App.data.test.tsx`
  (jsdom `localStorage`; spy on `Storage.prototype.setItem` to simulate a full disk).
- Do not touch other localStorage keys (`judya.v1`, `medmate.v1` share the origin).
