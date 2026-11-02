import { describe, expect, it } from 'vitest';
import { blankRootV3, sampleRootV3 } from './fixtures';
import { makeBackup, summarizeBackup } from './backup';
import { backupFileOf, restoreFromBackup } from './dataPage';
import { RECIPIENT_MAX, checkRecipient, formOf, recipientBarText, recipientOf, withRecipient } from './recipient';
import { DEFAULT_SETTINGS_V3, rootSchema, settingsSchema } from './schema';
import { loadRoot, saveRoot, type KeyValueStore } from './storage';

const memory = (): KeyValueStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
const R = { address: 'บ้านเลขที่ 99 ซอยตัวอย่าง', name: 'คุณสมมติ', phone: '081-000-0000' };

describe('checkRecipient', () => {
  it('trims all three; an empty one is left out', () => {
    expect(checkRecipient({ address: '  บ้าน 1  ', name: ' ก ', phone: ' 081 000 ' })).toEqual({ ok: true, value: { address: 'บ้าน 1', name: 'ก', phone: '081 000' } });
    expect(checkRecipient({ address: ' ', name: '', phone: '' })).toEqual({ ok: true, value: {} });
  });
  it('limits: address 300, name 60, phone 20 (counted after trimming)', () => {
    expect(checkRecipient({ address: 'ก'.repeat(300), name: 'ก'.repeat(60), phone: '1'.repeat(20) }).ok).toBe(true);
    expect(checkRecipient({ address: ` ${'ก'.repeat(300)} `, name: '', phone: '' }).ok).toBe(true);
    const bad = checkRecipient({ address: 'ก'.repeat(301), name: 'ก'.repeat(61), phone: '1'.repeat(21) });
    expect(bad).toEqual({ ok: false, errors: { address: 'address_too_long', name: 'name_too_long', phone: 'phone_too_long' } });
  });
  it('phone: only digits, + - and spaces', () => {
    for (const p of ['081-000-0000', '+66 81 000 0000', '0810000000']) expect(checkRecipient({ address: '', name: '', phone: p }).ok).toBe(true);
    for (const p of ['081-000-000a', '(081)0000', '081.000.0000', '๐๘๑', '081/000']) expect(checkRecipient({ address: '', name: '', phone: p })).toEqual({ ok: false, errors: { phone: 'phone_chars' } });
  });
});

describe('settings fields', () => {
  it('are optional: old settings without them still parse', () => {
    const parsed = settingsSchema.parse({ expiryWarnDays: 15, orderTemplate: '', orderDays: 30 });
    expect(parsed.recipientAddress).toBeUndefined();
    expect(rootSchema.safeParse(blankRootV3()).success).toBe(true);
    expect('recipientName' in DEFAULT_SETTINGS_V3).toBe(false);
  });
  it('the schema also refuses too long / wrong phone', () => {
    const s = { ...DEFAULT_SETTINGS_V3 };
    expect(settingsSchema.safeParse({ ...s, recipientAddress: 'ก'.repeat(301) }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...s, recipientName: 'ก'.repeat(61) }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...s, recipientPhone: '1'.repeat(21) }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...s, recipientPhone: '08a' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...s, recipientAddress: 'ก'.repeat(300), recipientName: 'ก'.repeat(60), recipientPhone: '1'.repeat(20) }).success).toBe(true);
  });
  it('the data version stays 3', () => {
    expect(withRecipient(blankRootV3(), R).version).toBe(3);
  });
});

describe('withRecipient / recipientOf', () => {
  it('sets the three, replaces them, and removes a missing one; other settings and tables stay', () => {
    const base = sampleRootV3();
    const a = withRecipient(base, R);
    expect(recipientOf(a)).toEqual(R);
    expect(a.settings).toMatchObject({ orderDays: base.settings.orderDays, orderTemplate: base.settings.orderTemplate, fontSize: base.settings.fontSize });
    expect({ ...a, settings: base.settings }).toEqual(base);
    const b = withRecipient(a, { name: 'ข' });
    expect(recipientOf(b)).toEqual({ name: 'ข' });
    expect('recipientAddress' in b.settings).toBe(false);
    expect(formOf(recipientOf(b))).toEqual({ address: '', name: 'ข', phone: '' });
  });
  it('the bar text: name and phone, or the empty words', () => {
    expect(recipientBarText({})).toBe('ยังไม่ได้ใส่ข้อมูลผู้รับ');
    expect(recipientBarText({ address: 'x' })).toBe('ยังไม่ได้ใส่ข้อมูลผู้รับ');
    expect(recipientBarText(R)).toBe('คุณสมมติ · 081-000-0000');
    expect(recipientBarText({ name: 'คุณสมมติ' })).toBe('คุณสมมติ');
  });
});

describe('storage round trip and backups', () => {
  it('saveRoot -> loadRoot keeps the recipient; settings written by the old app (no fields) load fine', () => {
    const store = memory();
    expect(saveRoot(withRecipient(sampleRootV3(), R), store).ok).toBe(true);
    const back = loadRoot(store);
    expect(back.status).toBe('ok');
    if (back.status === 'ok') expect(recipientOf(back.root)).toEqual(R);

    const old = memory();
    old.setItem('judya.v3', JSON.stringify(sampleRootV3()));
    const loaded = loadRoot(old);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(recipientOf(loaded.root)).toEqual({});
  });

  it('a backup file from before this step (no fields) can be read and restored; the current recipient stays', () => {
    const oldFile = makeBackup(sampleRootV3(), '2026-10-28T09:00:00+07:00').text;
    expect(JSON.parse(oldFile).settings.recipientName).toBeUndefined();
    const checked = summarizeBackup(oldFile);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const store = memory();
    const current = withRecipient(sampleRootV3(), R);
    const res = restoreFromBackup(checked.root, current, store);
    expect(res.ok).toBe(true);
    if (res.ok) expect(recipientOf(res.root)).toEqual(R);
  });

  it('a file that does carry the fields round-trips through the check and the restore', () => {
    const text = makeBackup(withRecipient(sampleRootV3(), R), '2026-10-28T09:00:00+07:00').text; // a file made by hand with the fields
    const checked = summarizeBackup(text);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(recipientOf(checked.root)).toEqual(R);
    const res = restoreFromBackup(checked.root, sampleRootV3(), memory());
    expect(res.ok).toBe(true);
  });

  it('the backup the app hands over does NOT carry the recipient (settings are not part of a backup)', () => {
    const file = backupFileOf(withRecipient(sampleRootV3(), R), '2026-10-28T09:00:00+07:00');
    expect(file.text).not.toContain(R.name);
    expect(file.text).not.toContain(R.phone);
    expect(file.text).not.toContain(R.address);
  });

  it('limits as numbers', () => {
    expect(RECIPIENT_MAX).toEqual({ address: 300, name: 60, phone: 20 });
  });
});
