# JudYa — Visual Refresh spec (for steps V1–V6)

Source of truth for the new look (replaces the look of design canvas v35; v35 stays the source for screen structure and behaviour only).
**Final design = mockup round 9, 10 screens: `docs/design/mockup-r9-reference.html`** (open it in a browser or read the HTML/CSS; images are removed, class `i-<name>` / `m-<pose>` / `avatar` show which image goes where; `i-shop` = icon `shops`). Where this doc and round 9 differ, round 9 wins. The tokens below are the same in round 9.
Copied from the owner's project docs `design-decisions-visual-refresh.md` and `design-plan-m4v.md`, plus tokens taken from mockup round 8. No real people or real medicine data here.

Rules for V1–V6: look only. Do NOT change `src/domain/**`, `src/state/**`, the `judya.v2` data model or existing logic tests. One step = one PR. Never merge yourself.

## Decisions D1–D12
| # | Topic | Decision |
|---|---|---|
| D1 | Icons | 28 icons, style "1B": navy outline, flat fill, inside a light circle. Colour carries meaning: red = expired / allergy / stop / delete; yellow = expiring soon / running low; green = success / call / LINE. Status colours are never decoration, and a status always has text next to it (never colour alone). |
| D2 | Icon count | One icon per card heading. No icons in list rows (today's meds, needs-attention, a member's meds). Exceptions: quick actions (adjust dose / stop medicine / history), bottom nav, add-medicine button. |
| D3 | Member avatars | 12 avatars replace initials. 48px, ring 2px in a member colour, no white double ring, row height >= 80px. |
| D4 | Mascot | "น้องเภสัช" (woman, white coat, dark outline), 8 poses: wave, pill, list, heart, point, ok, phone, sleep. Used: wave in home hero, ok on all-done, pill on empty state. Place only outside member cards (K1). |
| D5 | Home hero | Single flat colour: blue `#D6E6FD`; all-done state green `#CDEBD6`. NO gradients. Mascot stands on the bottom edge of the band. Date is a white pill. |
| D6 | Progress ring | **Round 9: 96px**, stroke 8px (viewBox 120, r=52), big number centred **28px/32**, under it "จาก N". |
| D7 | Cards | White always (all-done card also white; green only on the status chip). Padding 24px, gap between cards 20px, soft shadow. |
| D8 | Font weights | Headings / big numbers 600 (not 700), body 400, medicine names 600. Keep secondary text colour `#5F6368`. |
| D9 | Needs-attention card | Sorted by urgency (expired, few days, many days). Show member name on every row. Different wording: "ยาจะหมดใน N วัน" vs "หมดอายุใน N วัน". Expired shows red chip "เลิกใช้", not "0 วัน". Day number 20px, **shown as plain coloured text with no background chip** (round 9). Chevron at row end. Link "ดูทั้งหมด N". Tonal button "สั่งยา" (icon `order`) under the list. |
| D10 | Font size | 3 levels in Settings: normal = 93%, medium = 100%, large = 115%. Applies to the whole app, remembered. Owner decided this over the team's warning (K4). |
| D11 | Zoom lock | Lock pinch zoom and double-tap zoom like a native app (spec 2). |
| D12 | Source of truth | This doc + mockup round 8 override v35 for the look only. |

Risks accepted by the owner: K1 mascot must not look like a member; K2 white coat suggests a doctor, so Settings needs the text "จัดการยา ไม่ใช่คำแนะนำทางการแพทย์"; K3 images are AI-generated, check commercial terms before selling; K4 default 93% is about 14px, below the 15px rule in CLAUDE.md; K5 zoom lock conflicts with WCAG 1.4.4, revisit before selling; K7 only checked at 360/412px.

## Tokens (from mockup round 8, light only)
Colours
- `--bg #E8EAED` `--screen #F8F9FA` `--card #FFFFFF` `--ink #202124` `--muted #5F6368` `--strong #80868B` `--line #DADCE0`
- `--primary #1A73E8` `--primary-ink #1967D2` `--tint #E8F0FE` `--band #D6E6FD` (hero), done hero `#CDEBD6`
- `--ok #137333` `--ok-t #E6F4EA` · `--warn #8A5300` `--warn-t #FEF7E0` · `--err #C5221F` `--err-t #FCE8E6`
- ring / done-dot green `#34A853`; member ring colours `#1A73E8` `#34A853` `#FBBC05`; hero secondary text `#3C4043`
- Font: Noto Sans Thai, weights 400/500/600/700, fallback system-ui.
Shape and shadow
- Card radius 16px; pill radius 999px; phone radius 28px
- Card shadow `0 1px 2px rgba(60,64,67,.20), 0 1px 3px 1px rgba(60,64,67,.08)`
- Card padding 24px; main gap 20px; screen side padding 16px
Type scale (px at medium = 100%; all multiplied by `--fs`)
- hero title 26/34 w600 · hero sub 17/26 · heading in header 22/30 w600 · card heading 20/28 w600
- list title 17/24 w600 · list sub 16/24 · chip 16/24 w600 · days number 20/26 w600, unit 15/18 · note 16/24 · nav label 15/20 · ring number 34/38 w600
Sizes
- tap target >= 48px (back button 48, pill button min 48, main button min 52, list row min 60, tall row min 80)
- icon sizes 28/32/40/48/56/72; avatar 48 (72 on member page); mascot heights 88-140 depending on screen
- ring: 120px, r=52, stroke 8, dasharray 326.73
Font scale: `--fs` = 0.93 / 1 / 1.15 on `<html data-fs="n|m|l">` (mockup used px*fs; in the app use rem and change html font-size).

## Spec 1 — font size (D10)
- One variable at `<html data-fs="n|m|l">`; n=.93, m=1, l=1.15. Prefer rem and change the html font-size instead of multiplying each value. Respect Android system font size too (no fixed px).
- Store the choice in localStorage under its own key (NOT `judya.v2`), per device, not in the backup file.
- UI (step V5): Settings card "ขนาดตัวอักษร" with 3 buttons (>= 48px), a sample text, hint "ถ้าผู้สูงอายุใช้ร่วมด้วย แนะนำ กลาง หรือ ใหญ่".
- Pass criteria: at 360 and 412px, all 3 sizes, every page has no horizontal overflow (Playwright).

## Spec 2 — zoom lock (D11), do all five
1. `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`
2. CSS: `html,body{touch-action:pan-x pan-y; overscroll-behavior-y:none; -webkit-text-size-adjust:100%; -webkit-tap-highlight-color:transparent}`
3. `user-select:none` only on buttons, bottom nav and headings. Text must stay selectable/copyable in the LINE order message and in inputs.
4. Every input font-size >= 16px (stops the browser zooming on focus).
5. manifest: `display: standalone`, `orientation: portrait`, `theme_color #1A73E8`.
- Do not block the Android accessibility "force zoom" setting.
- Check on a real phone (Chrome and installed app): two-finger pinch no zoom, double-tap no zoom, pull-down at top no refresh, text copy works, normal scroll works.

## Spec 3 — images (delivered in `src/assets/visual/`)
- 28 icons: nav-home, nav-medicines, nav-members, nav-settings, today-meds, restock, add-medicine, expired, expiring-soon, allergy, insurance, prepare-meds, order, share-doctor, rx-medicine, household-medicine, adjust-dose, stop-medicine, history, line-message, copy, call-shop, delivery-fee, expiry-alert, shops, order-template, backup, delete
- 12 avatars: avatar-01 .. avatar-12 · 8 mascot poses: wave, pill, list, heart, point, ok, phone, sleep
- Currently WebP (trial). Step V1b swaps them for SVG; keep the helper so only file names change.

## Step V1 (this PR)
Put images, tokens, font-size scaffold and zoom lock in the repo. Do not change any screen yet.
Pass criteria: `npm test` green; at 360/412px and 3 font sizes nothing overflows (Playwright); app size after adding images <= 1 MB; zoom-lock checks 1-5 on the owner's phone.
Open question for the owner (put in `docs/DECISIONS.md`): default font size. Until decided use medium (100%) because normal (93%) is below the 15px minimum in CLAUDE.md.

## Steps after V1 (one PR each)
V2 home · V3 medicines list, add, detail · V4 members and member page · V5 order, shops, settings (font-size card, "not medical advice" text), share summary · V6 QA by a fresh session (text >= 14px, tap >= 48px, contrast 4.5:1, no colour-only status, no gradients).


## Round 9 corrections and decisions (supersede anything above)
- Ring 96px / number 28px; day badges are plain coloured text (no chip background); "expired" shows red text "เลิกใช้".
- Member rows on home: avatar, name, "ยา N รายการ" (+ " · จัดยาเอง" for self) and a chevron. No "ใกล้หมด" chip in member rows (it duplicated the needs-attention card). Member page keeps its two chips.
- Insurance row moved: the card heading "ข้อมูลสมาชิก" has the icon `insurance`; the row has none.
- Home needs-attention card has a tonal button "สั่งยา" (icon `order`) under the list; all-done screen has "ไปสั่งยา".
- Screens in round 9: 1 home, 2 home all done, 3 first run, 4 member page, 5 settings font size, 6 order (interactive), 7 order empty, 8 all medicines / household tab, 9 settings shops + order message, 10 share summary to doctor.
- Mockup names/phones/prices are sample data only. Medicine names in the HTML were replaced by "ยาตัวอย่าง A-E".
- Unclear item in a screen: stop and ask the owner, do not guess.
