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
// v3 Home (M4 PR 4): the real data route (a new user = S0) and the six demo states. Checked for sideways overflow
// like every page, and also for text under the minimum size and tap targets under 44px on v3 pages (route starts with #/n).
const V3_ROUTES = ['/', '/n', '/no-such-page', '/old', // M4 PR 7b: an unknown or retired route opens Home
   '/n?demo=normal', '/n?demo=alert', '/n?demo=empty0', '/n?demo=empty1', '/n?demo=notoday', '/n?demo=backup',
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
  '/n/settings/data?demo=normal&backup=old&error=wrong_version',
  // v3 order draft (M4 PR 11.2): real data (empty), the three demo houses, the add sheet (both tabs, a repeated name, a name that is in the list),
  // the unit sheet, and the add sheet on a house with nothing to suggest / no medicine at all
  '/n/order', '/n/order?demo=normal', '/n/order?demo=nolow', '/n/order?demo=nomeds',
  '/n/order?demo=normal&sheet=add&tab=meds', '/n/order?demo=normal&sheet=add&tab=new', '/n/order?demo=normal&sheet=add&tab=new&name=Simvastatin',
  '/n/order?demo=normal&sheet=add&tab=new&name=Meto', '/n/order?demo=normal&sheet=unit', '/n/order?demo=normal&sheet=unit&item=med:m8',
  '/n/order?demo=nolow&sheet=add&tab=meds', '/n/order?demo=nomeds&sheet=add&tab=meds', '/n/order?demo=nomeds&sheet=add&tab=new',
  // order message (M4 PR 11.3b-1): the card with an empty / filled recipient, delivery and pick-up, the recipient sheet, the "not complete" sheet
  // shop choice (M4 PR 11.3b-2a): no shop yet, three shops, switch off, a shop that misses prices with its price sheet, delivery and pick-up chosen, the shop form
  '/n/order?demo=normal&shops=three', '/n/order?demo=normal&shops=three&shipping=off', '/n/order?demo=normal&shops=three&sheet=prices&shop=s3',
  '/n/order?demo=normal&shops=three&recipient=full&shop=s1', '/n/order?demo=normal&shops=three&recipient=full&shop=s3', '/n/order?demo=normal&sheet=shop',
  '/n/order?demo=normal&recipient=full', '/n/order?demo=normal&recipient=full&shops=three&shop=s2', '/n/order?demo=normal&sheet=recipient',
  '/n/order?demo=normal&sheet=incomplete', '/n/order?demo=normal&recipient=full&sheet=recipient', '/n/order?demo=nolow&recipient=full',
  // v3 shops page (M4 PR 11.3a): real data (empty), an empty house, three shops, a 40-letter name, the add form (delivery), the edit form
  '/n/shops', '/n/shops?demo=empty', '/n/shops?demo=normal', '/n/shops?demo=long', '/n/shops?demo=normal&sheet=add', '/n/shops?demo=long&sheet=edit&item=s1',
  '/n/shops?demo=normal&sheet=edit&item=s3'];

// v3 shops page (M4 PR 11.3a): states that need pressing (pick-up form, wrong values, long values, the delete question).
const SHOPS_ADD = '/n/shops?demo=normal&sheet=add';
const fill = (page, label, value) => page.getByLabel(label, { exact: true }).fill(value);
const SHOPS_SCENARIOS = [
  ['add, pick-up', SHOPS_ADD, async (page) => { await click(page, 'ไปรับเอง'); }],
  ['add, wrong values', SHOPS_ADD, async (page) => { await fill(page, 'ชื่อร้าน', 'ก'); await fill(page, 'เบอร์โทร (ไม่บังคับ)', 'abc'); await click(page, 'บันทึก'); }],
  ['add, same name', SHOPS_ADD, async (page) => { await fill(page, 'ชื่อร้าน', 'ร้านทดสอบ ก'); await fill(page, 'ค่าส่ง', '40'); await click(page, 'บันทึก'); }],
  ['add, long values', SHOPS_ADD, async (page) => { await fill(page, 'ชื่อร้าน', 'ก'.repeat(40)); await fill(page, 'เบอร์โทร (ไม่บังคับ)', '+66 2 123 4567 000 00'); await fill(page, 'ค่าส่ง', '1234567.89'); }],
  ['edit, delete question', '/n/shops?demo=normal&sheet=edit&item=s1', async (page) => { await click(page, 'ลบร้านนี้'); }],
  ['edit long, delete question', '/n/shops?demo=long&sheet=edit&item=s1', async (page) => { await click(page, 'ลบร้านนี้'); }],
  ['saved toast', SHOPS_ADD, async (page) => { await fill(page, 'ชื่อร้าน', 'ร้านทดสอบ ง'); await fill(page, 'ค่าส่ง', '20'); await click(page, 'บันทึก'); }],
];

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

// v3 order draft (M4 PR 11.2): states that need pressing. Same shape as ADD_SCENARIOS.
const ORD = '/n/order?demo=normal';
const NOLOW = '/n/order?demo=nolow'; // many medicines to pick from: the search box and "see more" show
const SH3 = '/n/order?demo=normal&shops=three';
const LONGSHOP = `${SH3}&recipient=full`;
const ORDER_SCENARIOS = [
  // shop choice (M4 PR 11.3b-2a)
  ['shops, none yet (big button)', ORD, async () => {}],
  ['shops, none yet, form opened', ORD, async (page) => { await click(page, 'เพิ่มร้านแรก'); }],
  ['shops, form with a long name', ORD, async (page) => { await click(page, 'เพิ่มร้านแรก'); await page.getByLabel(/ชื่อร้าน/).fill('ร้านทดสอบ' + 'ก'.repeat(31)); await click(page, 'บันทึก'); }],
  ['shops, three compared', SH3, async () => {}],
  ['shops, fee switch off', SH3, async (page) => { await page.getByRole('switch').click(); }],
  ['shops, price sheet', SH3, async (page) => { await page.getByRole('button', { name: /^ใส่ราคา/ }).click(); }],
  ['shops, price sheet, wrong value', SH3, async (page) => { await page.getByRole('button', { name: /^ใส่ราคา/ }).click(); await page.getByLabel(/^ราคาต่อ หลอด/).fill('0'); await click(page, 'บันทึกราคา'); }],
  ['shops, price sheet, long value', SH3, async (page) => { await page.getByRole('button', { name: /^ใส่ราคา/ }).click(); await page.getByLabel(/^ราคาต่อ หลอด/).fill('9'.repeat(30)); }],
  ['shops, delivery shop chosen', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ก' }).click(); }],
  ['shops, pick-up shop chosen', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ข' }).click(); }],
  ['shops, shop that misses prices chosen', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ค' }).click(); }],
  ['shops, many lines (+ pressed 40 times) with a shop chosen', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ก' }).click(); const plus = page.getByRole('button', { name: /^เพิ่มจำนวน/ }).first(); for (let i = 0; i < 40; i += 1) await plus.click(); }],
  // order saved (M4 PR 11.3b-2b)
  ['book sheet, shop with every price', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ก' }).click(); await click(page, 'บันทึกว่าสั่งแล้ว'); }],
  ['book sheet, shop that misses prices (boxes)', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ค' }).click(); await click(page, 'บันทึกว่าสั่งแล้ว'); }],
  ['book sheet, wrong price', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ค' }).click(); await click(page, 'บันทึกว่าสั่งแล้ว'); await page.getByRole('dialog').getByLabel(/^ราคาต่อ หลอด/).fill('0'); await page.getByRole('dialog').getByRole('button', { name: 'สั่งแล้ว' }).click(); }],
  ['book sheet, long price typed', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ค' }).click(); await click(page, 'บันทึกว่าสั่งแล้ว'); await page.getByRole('dialog').getByLabel(/^ราคาต่อ หลอด/).fill('9'.repeat(30)); }],
  ['after booking (toast, lines gone)', LONGSHOP, async (page) => { await page.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ก' }).click(); await click(page, 'บันทึกว่าสั่งแล้ว'); await page.getByRole('dialog').getByRole('button', { name: 'สั่งแล้ว' }).click(); }],
  ['badge "สั่งแล้ว รอรับ"', `${ORD}&orders=waiting`, async () => {}],
  ['badge, long quantity (+ pressed 40 times)', `${ORD}&orders=waiting`, async (page) => { const plus = page.getByRole('button', { name: /^เพิ่มจำนวน/ }).first(); for (let i = 0; i < 40; i += 1) await plus.click(); }],
  // order message (M4 PR 11.3b-1)
  ['message, nothing ticked', '/n/order?demo=normal&recipient=full', async (page) => { for (const box of await page.getByRole('checkbox').all()) await box.uncheck(); }],
  ['message, long recipient (300 + 60 + 20 letters)', '/n/order?demo=normal', async (page) => { await click(page, /^ข้อมูลผู้รับ/); await page.getByLabel(/^ที่อยู่/).fill('ก'.repeat(300)); await page.getByLabel('ชื่อผู้รับ').fill('ข'.repeat(60)); await page.getByLabel('เบอร์โทร').fill('1'.repeat(20)); await click(page, 'บันทึก'); }],
  ['message, long recipient, pick-up', '/n/order?demo=normal&recipient=full&shops=three&shop=s2', async (page) => { await click(page, /^ข้อมูลผู้รับ/); await page.getByLabel('ชื่อผู้รับ').fill('ข'.repeat(60)); await page.getByLabel('เบอร์โทร').fill('1'.repeat(20)); await click(page, 'บันทึก'); }],
  ['message, wrong values in the sheet', '/n/order?demo=normal&sheet=recipient', async (page) => { await page.getByLabel(/^ที่อยู่/).fill('ก'.repeat(301)); await page.getByLabel('เบอร์โทร').fill('abc'); await click(page, 'บันทึก'); }],
  ['message, copy with no recipient (sheet)', '/n/order?demo=normal', async (page) => { await click(page, 'คัดลอกข้อความ'); }],
  ['message, many lines (+ pressed 40 times)', '/n/order?demo=normal&recipient=full', async (page) => { const plus = page.getByRole('button', { name: /^เพิ่มจำนวน/ }).first(); for (let i = 0; i < 40; i += 1) await plus.click(); }],
  ['nothing ticked', ORD, async (page) => { for (const box of await page.getByRole('checkbox').all()) await box.uncheck(); }],
  ['long quantity (+ pressed 40 times)', ORD, async (page) => { const plus = page.getByRole('button', { name: /^เพิ่มจำนวน/ }).first(); for (let i = 0; i < 40; i += 1) await plus.click(); }],
  ['add sheet, see all', `${NOLOW}&sheet=add&tab=meds`, async (page) => { await page.getByRole('button', { name: /^ดูเพิ่ม/ }).click(); }],
  ['add sheet, search finds nothing', `${NOLOW}&sheet=add&tab=meds`, async (page) => { await page.getByLabel('ค้นหาชื่อยา').fill('zzzz'); }],
  ['add sheet, one added (toast)', `${ORD}&sheet=add&tab=meds`, async (page) => { await page.getByRole('button', { name: /^เพิ่ม Losartan/ }).click(); }],
  ['new medicine, box with count', `${ORD}&sheet=add&tab=new&name=ยาใหม่ทดสอบ`, async (page) => { await click(page, 'กล่อง'); await page.getByLabel(/ต่อกล่อง/).fill('30'); }],
  ['new medicine, other kind (typed unit)', `${ORD}&sheet=add&tab=new&name=ยาใหม่ทดสอบ`, async (page) => { await click(page, 'อื่นๆ'); }],
  ['new medicine, liquid', `${ORD}&sheet=add&tab=new&name=ยาใหม่ทดสอบ`, async (page) => { await click(page, 'ยาน้ำ'); }],
  ['new medicine, cream', `${ORD}&sheet=add&tab=new&name=ยาใหม่ทดสอบ`, async (page) => { await click(page, 'ครีม'); }],
  ['new medicine, wrong strength', `${ORD}&sheet=add&tab=new&name=ยาใหม่ทดสอบ`, async (page) => { await page.getByPlaceholder('เช่น 500').fill('abc'); }],
  ['new medicine, long name', `${ORD}&sheet=add&tab=new&name=${'ยาที่มีชื่อยาวมากๆ'.repeat(5)}`, async () => {}],
  ['new medicine, same name, kept as new', `${ORD}&sheet=add&tab=new&name=Simvastatin`, async (page) => { await click(page, 'เพิ่มเป็นยาใหม่'); }],
  ['unit sheet, box chosen', `${ORD}&sheet=unit`, async (page) => { await click(page, 'กล่อง'); }],
  ['unit sheet, house medicine', `${ORD}&sheet=unit&item=house:h1`, async () => {}],
  ['unit sheet, other kind', `${ORD}&sheet=unit&item=med:m3`, async () => {}],
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

/** v3 pages only: text smaller than `minPx`, and enabled buttons / links shorter than 44px (v3 board value). */
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

    // 1f) v3 order draft after pressing (M4 PR 11.2)
    for (const [label, route, act] of ORDER_SCENARIOS) {
      await visit(route, 'v3');
      await act(page);
      const bad = await page.evaluate(measure);
      checked += 1;
      if (bad) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 order(${label}): ${bad}`); }
      const small = await page.evaluate(measureV3, fs === 'n' ? 13.9 : 14.9);
      if (small) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 order(${label}): ${small}`); }
    }

    // 1g) v3 shops page after pressing (M4 PR 11.3a)
    for (const [label, route, act] of SHOPS_SCENARIOS) {
      await visit(route, 'v3');
      await act(page);
      const bad = await page.evaluate(measure);
      checked += 1;
      if (bad) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 shops(${label}): ${bad}`); }
      const small = await page.evaluate(measureV3, fs === 'n' ? 13.9 : 14.9);
      if (small) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 shops(${label}): ${small}`); }
    }

    // 1e) v3 "can't read the data" screen (M4 PR 7): corrupt judya.v3 on Home and on two other pages, then the start-over sheets
    await page.goto(`${BASE}#/`);
    await page.evaluate(() => window.localStorage.setItem('judya.v3', '{not json'));
    const problemScenarios = [
      ['home', '/', async () => {}],
      ['meds list', '/n/meds', async () => {}],
      ['data page', '/n/settings/data', async () => {}],
      ['start over, step 1', '/', async (pg) => { await pg.getByRole('button', { name: 'เริ่มใหม่', exact: true }).click(); }],
      ['start over, step 2', '/', async (pg) => { await pg.getByRole('button', { name: 'เริ่มใหม่', exact: true }).click(); await pg.getByRole('button', { name: 'ต่อไป', exact: true }).click(); }],
    ];
    for (const [label, route, act] of problemScenarios) {
      await visit(route, 'v3 problem');
      await act(page);
      const bad = await page.evaluate(measure);
      checked += 1;
      if (bad) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 problem(${label}): ${bad}`); }
      const small = await page.evaluate(measureV3, fs === 'n' ? 13.9 : 14.9);
      if (small) { problems += 1; console.log(`FAIL ${width}px fs=${fs} v3 problem(${label}): ${small}`); }
    }
    await page.evaluate(() => window.localStorage.removeItem('judya.v3'));

    await ctx.close();
  }
}

await browser.close();
stop();
console.log(`${checked} page checks, ${problems} problem(s)`);
process.exit(problems === 0 ? 0 : 1);
