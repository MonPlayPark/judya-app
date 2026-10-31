// Visual check (V1): at 360 and 412px wide and all 3 font sizes, no page may scroll sideways.
// Run:  npm run build && npm run check:overflow   (needs Chromium; set CHROMIUM_PATH if it is not at the default place)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/judya-app/`;
const WIDTHS = [360, 412];
const SIZES = ['n', 'm', 'l'];
const STATIC_ROUTES = ['/', '/today', '/meds', '/meds?tab=house', '/meds/new', '/meds/new/schedule', '/meds/new/stock',
  '/house/new', '/members', '/members/new', '/order', '/settings', '/no-such-page'];

// v3 Home (M4 PR 4): the real data route (a new user = S0) and the six demo states. Checked for sideways overflow
// like every page, and also for text under the minimum size and tap targets under 44px on v3 pages (route starts with #/n).
const V3_ROUTES = ['/n', '/n?demo=normal', '/n?demo=alert', '/n?demo=empty0', '/n?demo=empty1', '/n?demo=notoday', '/n?demo=backup',
  // v3 medicine list (M4 PR 5a): real data (empty), every demo, the house tab and both folded sections open
  '/n/meds', '/n/meds?demo=normal', '/n/meds?demo=normal&open=stopped', '/n/meds?demo=normal&tab=house', '/n/meds?demo=normal&open=deleted',
  '/n/meds?demo=nomember', '/n/meds?demo=nomeds', '/n/meds?demo=nohouse&tab=house',
  // v3 medicine detail (M4 PR 5b): every view and every bottom sheet, a missing medicine, and the house medicine sheets
  '/n/meds/a4?demo=normal', '/n/meds/a4?demo=normal&sheet=refill', '/n/meds/a4?demo=normal&sheet=stop', '/n/meds/a4?demo=normal&sheet=history',
  '/n/meds/a9?demo=cream', '/n/meds/a9?demo=cream&sheet=refill', '/n/meds/a7?demo=stopped', '/n/meds/a7?demo=stopped&sheet=resume',
  '/n/meds/a10?demo=notdaily', '/n/meds/nope?demo=normal', '/n/meds/zzz',
  '/n/meds?demo=normal&tab=house&item=h3', '/n/meds?demo=normal&tab=house&item=h3&sheet=refill', '/n/meds?demo=normal&tab=house&item=h4',
  // v3 add member (M4 PR 6a): blank, with members already there, the picture sheet, the sheet after saving, and a list with a cream
  '/n/members/new', '/n/members/new?demo=nomember', '/n/members/new?demo=normal', '/n/members/new?demo=nomember&sheet=avatars',
  '/n/members/new?demo=nomember&sheet=done', '/n/meds?demo=cream',
  // v3 add medicine (M4 PR 6b): step 1 new / found in the house / same house name, the schedule step and the stock step first views
  '/n/meds/new', '/n/meds/new?demo=normal', '/n/meds/new?demo=nomember', '/n/meds/new?demo=normal&name=Metformin', '/n/meds/new?demo=normal&type=house&name=ยาธาตุน้ำขาว',
  '/n/meds/new?demo=normal&person=p2&name=ยาใหม่ทดสอบ&step=2', '/n/meds/new?demo=normal&person=p2&name=ยาใหม่ทดสอบ&step=3', '/n/meds/new?demo=normal&type=house&name=ยาสามัญใหม่&step=2',
  // v3 data and backup page (M4 PR 6c): real data (empty), a recent backup, never backed up, the 14-day warning, nothing but house medicines,
  // every restore error, and the confirm sheet
  '/n/settings/data', '/n/settings/data?demo=normal', '/n/settings/data?demo=backup', '/n/settings/data?demo=normal&backup=old', '/n/settings/data?demo=nomeds',
  '/n/settings/data?demo=normal&error=not_json', '/n/settings/data?demo=normal&error=wrong_version', '/n/settings/data?demo=normal&error=invalid',
  '/n/settings/data?demo=normal&error=too_big', '/n/settings/data?demo=normal&error=save_failed', '/n/settings/data?demo=normal&sheet=confirm',
  '/n/settings/data?demo=normal&backup=old&error=wrong_version'];

// v3 add medicine (M4 PR 6b): states that need pressing. Each one opens `route`, runs the clicks, then is measured like the rest.
const ADD = '/n/meds/new?demo=normal&person=p2&name=ยาใหม่ทดสอบ';
const click = (page, name) => page.getByRole('button', { name, exact: true }).click();
const ADD_SCENARIOS = [
  ['step 2, four periods', `${ADD}&step=2`, async (page) => { for (const n of ['กลางวัน', 'เย็น', 'ก่อนนอน']) await click(page, n); }],
  ['step 2, weekdays', `${ADD}&step=2`, async (page) => { await click(page, 'เลือกวัน'); await click(page, 'พฤ'); }],
  ['step 2, every N hours', `${ADD}&step=2`, async (page) => { await click(page, 'ทุกกี่ชั่วโมง'); await click(page, 'กินกี่วัน'); await page.getByLabel('จำนวนวันที่กิน').fill('7'); }],
  ['step 2, liquid over 30 ml', `${ADD}&step=2&kind=liquid`, async (page) => { for (let i = 0; i < 11; i += 1) await click(page, 'เพิ่ม เช้า'); }],
  ['step 2, cream', `${ADD}&step=2&kind=cream`, async () => {}],
  ['step 3, box (nothing typed)', `${ADD}&step=3`, async () => {}],
  ['step 3, box filled', `${ADD}&step=3`, async (page) => { await page.getByLabel('จำนวนแผงต่อกล่อง').fill('3'); await page.getByLabel('จำนวนเม็ดต่อแผง').fill('10'); await page.getByLabel('จำนวน กล่อง', { exact: true }).fill('1'); await page.getByLabel('จำนวน แผง').fill('2'); await page.getByLabel('จำนวน เม็ดเศษ').fill('3'); }],
  ['step 3, strip', `${ADD}&step=3`, async (page) => { await click(page, 'แผง'); }],
  ['step 3, bottle', `${ADD}&step=3`, async (page) => { await click(page, 'ขวด/กระปุก'); await page.getByLabel('จำนวนเม็ดต่อขวด').fill('100'); }],
  ['step 3, not counted', `${ADD}&step=3`, async (page) => { await click(page, 'ไม่นับสต็อก'); }],
  ['step 3, liquid', `${ADD}&step=3&kind=liquid`, async (page) => { await page.getByLabel('ปริมาณต่อขวด').fill('60'); }],
  ['step 3, cream', `${ADD}&step=3&kind=cream`, async () => {}],
  ['step 3, drops', `${ADD}&step=3&kind=drops`, async () => {}],
  ['step 3, sachet', `${ADD}&step=3&kind=sachet`, async () => {}],
  ['step 3, sachet single', `${ADD}&step=3&kind=sachet`, async (page) => { await click(page, 'ซองเดี่ยว'); }],
  ['step 3, other', `${ADD}&step=3&kind=other`, async () => {}],
  ['step 3, house', '/n/meds/new?demo=normal&type=house&name=ยาสามัญใหม่&step=2', async (page) => { await click(page, 'แผง'); }],
  ['step 3, existing medicine', '/n/meds/new?demo=normal&name=VitaminD', async (page) => { await page.getByRole('button', { name: /คุณแม่/ }).click(); await page.getByRole('button', { name: 'เพิ่มให้คุณแม่ด้วย' }).click(); await page.getByRole('button', { name: 'ถัดไป' }).click(); }],
  ['dose confirm sheet', `${ADD}&step=2&kind=liquid`, async (page) => { for (let i = 0; i < 11; i += 1) await click(page, 'เพิ่ม เช้า'); await click(page, 'ถัดไป'); await click(page, 'ไม่นับสต็อก'); await click(page, 'บันทึกยา'); }],
];

const chromePath = process.env.CHROMIUM_PATH
  ?? ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => existsSync(p));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start (run npm run build first)');
}

/** Returns a description of what sticks out sideways, or '' when the page fits. */
const measure = () => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  if (document.documentElement.scrollWidth > vw) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) {
      // A scrolling strip inside the page is fine; only report things that make the page itself wider.
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o !== 'visible') { clipped = true; break; }
      }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
  }
  return out.slice(0, 5).join('; ');
};

/** v3 pages only: text smaller than `minPx`, and enabled buttons / links shorter than 44px (v3 board value; v2 pages keep 48px in `measure`). */
const measureV3 = (minPx) => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    const el = walker.currentNode.parentElement;
    if (!text || !el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minPx) out.push(`text "${text.slice(0, 20)}" ${size.toFixed(2)}px`);
  }
  for (const el of document.querySelectorAll('button:not([disabled]), a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 43.5) out.push(`tap target ${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(r.height)}px high`);
  }
  return out.slice(0, 5).join('; ');
};

await waitForServer();
const browser = await chromium.launch({ executablePath: chromePath });
let problems = 0;
let checked = 0;

for (const width of WIDTHS) {
  for (const fs of SIZES) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
    await ctx.addInitScript((size) => window.localStorage.setItem('judya.fontsize', size), fs);
    const page = await ctx.newPage();

    const visit = async (route, label) => {
      await page.goto(`${BASE}#${route}`);
      await page.reload(); // hash change alone does not re-run the app; reload keeps the state in localStorage
      await page.waitForSelector('#root > *');
      const fsOnHtml = await page.evaluate(() => document.documentElement.dataset.fs);
      if (fsOnHtml !== fs) { console.log(`FAIL ${width}px fs=${fs} ${route}: data-fs is ${fsOnHtml}`); problems += 1; }
      const bad = await page.evaluate(measure);
      checked += 1;
      if (bad) { problems += 1; console.log(`FAIL ${width}px fs=${fs} ${label} ${route}: ${bad}`); }
    };

    // 1) empty house
    for (const r of STATIC_ROUTES) await visit(r, 'empty');

    // 1b) v3 Home: all states, plus the text size and tap target checks (14px at "normal", 15px at the larger sizes)
    for (const r of V3_ROUTES) {
      await visit(r, 'v3');
      const small = await page.evaluate(measureV3, fs === 'n' ? 13.9 : 14.9);
      if (small) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 ${r}: ${small}`); }
    }

    // 1c) v3 add-member page after typing (M4 PR 6a): a filled form, a wrong birth year, a 40-letter name with the same-name warning
    const typed = [
      ['filled', async () => { await page.fill('#mf-name', 'คุณยาย'); await page.getByRole('button', { name: 'ญาติ', exact: true }).click(); await page.fill('#mf-year', '2503'); }],
      ['wrong year', async () => { await page.fill('#mf-name', 'คุณยาย'); await page.getByRole('button', { name: 'ลูก', exact: true }).click(); await page.fill('#mf-year', '2399'); }],
      ['long name + wrong year', async () => { await page.fill('#mf-name', 'ก'.repeat(40)); await page.getByRole('button', { name: 'อื่นๆ', exact: true }).click(); await page.fill('#mf-year', '25'); }],
      ['self (switch on)', async () => { await page.fill('#mf-name', 'ตัวเอง'); await page.getByRole('button', { name: 'ตัวฉัน', exact: true }).click(); }],
    ];
    for (const [label, act] of typed) {
      await visit('/n/members/new?demo=nomember', 'v3');
      await act();
      const bad = await page.evaluate(measure);
      checked += 1;
      if (bad) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 typed(${label}): ${bad}`); }
      const small = await page.evaluate(measureV3, fs === 'n' ? 13.9 : 14.9);
      if (small) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 typed(${label}): ${small}`); }
    }

    // 1d) v3 add-medicine page after pressing (M4 PR 6b)
    for (const [label, route, act] of ADD_SCENARIOS) {
      await visit(route, 'v3');
      await act(page);
      const bad = await page.evaluate(measure);
      checked += 1;
      if (bad) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 add-med(${label}): ${bad}`); }
      const small = await page.evaluate(measureV3, fs === 'n' ? 13.9 : 14.9);
      if (small) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 add-med(${label}): ${small}`); }
    }

    // 2) house with the sample data (pages that need ids too)
    await page.goto(`${BASE}#/`);
    await page.getByRole('button', { name: 'ลองดูด้วยข้อมูลตัวอย่าง' }).click();
    await page.waitForTimeout(300);
    const ids = await page.evaluate(() => {
      const root = JSON.parse(window.localStorage.getItem('judya.v2') ?? '{}');
      return {
        assignment: root.assignments?.[0]?.id,
        house: root.houseItems?.[0]?.id,
        person: root.persons?.[0]?.id,
      };
    });
    const routes = [...STATIC_ROUTES];
    if (ids.assignment) routes.push(`/meds/${ids.assignment}`);
    if (ids.house) routes.push(`/house/${ids.house}`);
    if (ids.person) routes.push(`/members/${ids.person}`, `/members/${ids.person}/edit`, `/members/${ids.person}/share`, `/today?who=${ids.person}`);
    if (!ids.assignment || !ids.house || !ids.person) { problems += 1; console.log('FAIL could not read sample ids'); }
    for (const r of routes) await visit(r, 'sample');
    await ctx.close();
  }
}

await browser.close();
stop();
console.log(`${checked} page checks, ${problems} problem(s)`);
process.exit(problems === 0 ? 0 : 1);
