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

## Next: step 3.2 (a: today + home · b: add medicine + detail · c: members · d: backup)
Start of 3.2 needs answers to open question **O1 (`Snapshot` fields)** by 3.2b — see `docs/DECISIONS.md`.
Things 3.2 must do that 3.1 left on purpose:
- `todayDoses`, `dosesOn`, `stockNow` etc. (BRIEF section 4) are **not written yet**; only the ported calc exists.
- Replace `EXPIRY_WARN_DAYS = 30` with `settings.expiryWarnDays`.
- A data layer (`actions.ts`) so screens never write storage themselves (BRIEF 3.2). `storage.ts` is only the low-level part.
- UI for `corrupt` / `wrong-version` / `unavailable` load results (never overwrite them silently) and for `quota` save errors.
- `navigator.storage.persist()` and the sample-data button (Q12).

## Working notes
- Commands: `npm test`, `npm run build`, `npm run typecheck`, `npm run dev`. After `npm run build`, `npx vite preview --port 4173`
  serves the real offline build at `http://localhost:4173/judya-app/`.
- Tests use made-up data only (`src/domain/fixtures.ts`). Never put real names or medicines in this public repo.
- Component tests mock `virtual:pwa-register` (see `src/App.test.tsx`).
- Do not touch other localStorage keys (`judya.v1`, `medmate.v1` share the origin).
