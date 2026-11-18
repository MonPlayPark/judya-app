// The two bottom sheets of the order draft screen (M4 PR 11.2): "เพิ่มรายการ" (pick from the medicine list, or type a new medicine) and
// "แก้หน่วยสั่ง" (the sell unit of one line, for this order only). They only hand finished lines back to the page; nothing is saved here.
import { useId, useState } from 'react';
import { InfoIcon, MinusIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { KindIcon } from '../../components/v3/KindIcon';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import {
  KIND_LABEL, KIND_ORDER, STRENGTH_UNITS, SELL_UNIT_MAX, asksPerSellUnit, changeSellUnit, defaultPerSellUnit, hasLine, orderCandidates, perUnitWord, sellUnitChoices,
  type Candidate,
} from '../../domain/v3/orderDraft';
import { findNameClash, makeFreeLine, makeManualLine, normalizeName, type DraftLine } from '../../domain/v3/orderLines';
import type { MedKind, Root } from '../../domain/v3/schema';
import styles from './OrderSheets.module.css';

export type AddTab = 'meds' | 'new';

/** How many medicines the "from the list" tab shows before "ดูเพิ่ม". */
export const SHORT_LIST = 6;

const toNumber = (text: string): number | null => {
  const t = text.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

// ---------------------------------------------------------------------------------------------------- add an item

export function AddItemSheet({
  root,
  today,
  lines,
  initialTab,
  initialName,
  onAdd,
  onClose,
}: {
  root: Root;
  today: IsoDate;
  lines: readonly DraftLine[];
  initialTab: AddTab;
  initialName?: string;
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<AddTab>(initialTab);
  const keys = lines.map((l) => l.key);
  const addFromList = (c: Candidate): void => {
    const line = makeManualLine(root, c.ref, today);
    if (line) onAdd(line);
  };
  return (
    <Sheet title="เพิ่มรายการ" onClose={onClose} closeButton tall>
      <div className={styles.tabs} role="tablist" aria-label="เพิ่มจาก">
        <button type="button" role="tab" aria-selected={tab === 'meds'} className={tab === 'meds' ? `${styles.tab} ${styles.tabOn}` : styles.tab} onClick={() => setTab('meds')}>
          จากรายการยา
        </button>
        <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? `${styles.tab} ${styles.tabOn}` : styles.tab} onClick={() => setTab('new')}>
          ยาใหม่
        </button>
      </div>
      {tab === 'meds' ? (
        <FromList root={root} today={today} keys={keys} onPick={addFromList} />
      ) : (
        <NewMedicine root={root} today={today} lines={lines} keys={keys} {...(initialName ? { initialName } : {})} onAdd={onAdd} onPick={addFromList} />
      )}
    </Sheet>
  );
}

function FromList({ root, today, keys, onPick }: { root: Root; today: IsoDate; keys: readonly string[]; onPick: (c: Candidate) => void }) {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const everything = orderCandidates(root, today, keys);
  const found = query.trim() === '' ? everything : orderCandidates(root, today, keys, query);
  const shown = all ? found : found.slice(0, SHORT_LIST);
  const noMedicineAtAll = root.medications.length === 0 && root.houseItems.every((h) => h.removedAt !== undefined || !h.stock);
  return (
    <div className={sheetStyles.body}>
      {everything.length > SHORT_LIST && (
        <input
          className={styles.search}
          type="search"
          inputMode="search"
          placeholder="ค้นหาชื่อยา"
          aria-label="ค้นหาชื่อยา"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAll(false);
          }}
        />
      )}
      {found.length === 0 ? (
        <p className={styles.empty}>
          {everything.length === 0
            ? noMedicineAtAll
              ? 'ยังไม่มียาในรายการยา ถ้าจะสั่งยาที่ยังไม่มี ให้เลือกแท็บ "ยาใหม่"'
              : 'ยาในรายการยาอยู่ในรายการสั่งครบแล้ว'
            : 'ไม่พบยาชื่อนี้ในรายการยา ถ้าเป็นยาที่ยังไม่มี ให้เลือกแท็บ "ยาใหม่"'}
        </p>
      ) : (
        <ul className={styles.list}>
          {shown.map((c) => (
            <li key={c.key} className={styles.item}>
              <div className={styles.itemText}>
                <p className={styles.itemName}>{c.name}</p>
                <p className={styles.itemSub}>{c.sub}</p>
              </div>
              <button type="button" className={styles.addChip} aria-label={`เพิ่ม ${c.name}`} onClick={() => onPick(c)}>
                <PlusIcon />
                เพิ่ม
              </button>
            </li>
          ))}
        </ul>
      )}
      {!all && found.length > SHORT_LIST && (
        <button type="button" className={sheetStyles.cancel} onClick={() => setAll(true)}>
          ดูเพิ่ม ({found.length - SHORT_LIST})
        </button>
      )}
    </div>
  );
}

function NewMedicine({
  root,
  today,
  lines,
  keys,
  initialName,
  onAdd,
  onPick,
}: {
  root: Root;
  today: IsoDate;
  lines: readonly DraftLine[];
  keys: readonly string[];
  initialName?: string;
  onAdd: (line: DraftLine) => void;
  onPick: (c: Candidate) => void;
}) {
  const nameId = useId();
  const [name, setName] = useState(initialName ?? '');
  const [strengthValue, setStrengthValue] = useState('');
  const [strengthUnit, setStrengthUnit] = useState<(typeof STRENGTH_UNITS)[number]>(STRENGTH_UNITS[0]);
  const [kind, setKind] = useState<MedKind>('tablet');
  const [sellUnit, setSellUnit] = useState<string>(sellUnitChoices('tablet').units[0] ?? '');
  const [qty, setQty] = useState('1');
  const [per, setPer] = useState('');
  const [addToList, setAddToList] = useState(true);
  const [okNewName, setOkNewName] = useState<string | null>(null); // the (normalised) typed name the owner chose to keep as a new medicine
  const [tried, setTried] = useState(false);

  const typed = name.trim();
  const clash = findNameClash(root, typed);
  const clashKey = clash ? (clash.kind === 'med' ? `med:${clash.medicationId}` : `house:${clash.houseItemId}`) : null;
  const clashUsable = clash !== null && clashKey !== null && !keys.includes(clashKey) && (clash.kind === 'med' || makeManualLine(root, { kind: 'house', houseItemId: clash.houseItemId }, today) !== null);
  const keepAsNew = clash !== null && okNewName === typed;
  const suggestions = typed.length >= 2 && clash === null ? orderCandidates(root, today, keys, typed).slice(0, 3) : [];

  const qtyNumber = toNumber(qty);
  const qtyOk = qtyNumber !== null && Number.isInteger(qtyNumber) && qtyNumber >= 1;
  const strengthNumber = toNumber(strengthValue);
  const strengthBad = strengthNumber !== null && !(strengthNumber > 0);
  const perNumber = toNumber(per);
  const asksPer = asksPerSellUnit(kind, sellUnit);
  const perBad = asksPer && perNumber !== null && !(perNumber > 0);
  const choices = sellUnitChoices(kind);
  const sameName = typed !== '' && hasLine(lines, `free:${normalizeName(typed)}`);
  const blockedByClash = clash !== null && !keepAsNew;
  const canAdd = typed !== '' && qtyOk && !blockedByClash && !sameName;

  const pickKind = (k: MedKind): void => {
    setKind(k);
    setSellUnit(sellUnitChoices(k).units[0] ?? (k === 'other' ? 'ชิ้น' : ''));
    setPer('');
  };

  const submit = (): void => {
    setTried(true);
    if (!canAdd || strengthBad || perBad) return;
    const res = makeFreeLine(root, {
      name: typed,
      qty: qtyNumber ?? 0,
      sellUnit,
      medKind: kind,
      addToList,
      ...(asksPer && perNumber !== null ? { perSellUnit: perNumber } : {}),
      ...(strengthNumber !== null ? { strength: { value: strengthNumber, unit: strengthUnit } } : {}),
    });
    if (!res.ok) return; // shown next to the field below (sell unit left empty)
    onAdd(res.line);
    setName('');
    setStrengthValue('');
    setPer('');
    setQty('1');
    setOkNewName(null);
    setTried(false);
  };

  const stepQty = (d: 1 | -1): void => setQty(String(Math.max(0, (qtyOk ? (qtyNumber ?? 0) : 0) + d)));
  const sellUnitEmpty = sellUnit.trim() === '';

  return (
    <div className={sheetStyles.body}>
      <div className={styles.field}>
        <label className={sheetStyles.label} htmlFor={nameId}>
          ชื่อยา*
        </label>
        <input id={nameId} className={sheetStyles.textInput} type="text" autoComplete="off" placeholder="พิมพ์ชื่อยา" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {suggestions.map((c) => (
          <button key={c.key} type="button" className={styles.suggest} aria-label={`มีในรายการยา ${c.name} กดเพื่อเพิ่ม`} onClick={() => onPick(c)}>
            <span className={styles.suggestTag}>
              <PlusIcon />
              มีในรายการยา
            </span>
            <span className={styles.suggestName}>{c.name}</span>
          </button>
        ))}
        {clash && !keepAsNew && (
          <div className={styles.warn} role="alert">
            <p className={styles.warnText}>
              <WarningIcon />
              <span>มียา "{clash.name}" ในระบบแล้ว ถ้าสั่งยานี้ ควรใช้ยาในระบบ เพื่อให้รับของแล้วสต็อกเพิ่มให้</span>
            </p>
            {clashKey !== null && keys.includes(clashKey) && <p className={sheetStyles.hint}>ยานี้อยู่ในรายการสั่งแล้ว</p>}
            {clash.kind === 'house' && !clashUsable && clashKey !== null && !keys.includes(clashKey) && <p className={sheetStyles.hint}>ยาสามัญนี้ยังไม่นับสต็อก จึงเลือกจากรายการยาไม่ได้</p>}
            <div className={styles.warnButtons}>
              {clashUsable && (
                <button
                  type="button"
                  className={sheetStyles.primary}
                  onClick={() => {
                    const line = makeManualLine(root, clash.kind === 'med' ? { kind: 'med', medicationId: clash.medicationId } : { kind: 'house', houseItemId: clash.houseItemId }, today);
                    if (line) onAdd(line);
                  }}
                >
                  ใช้ยาในระบบ
                </button>
              )}
              <button type="button" className={sheetStyles.cancel} onClick={() => setOkNewName(typed)}>
                เพิ่มเป็นยาใหม่
              </button>
            </div>
          </div>
        )}
        {sameName && <p className={sheetStyles.error}>ชื่อนี้อยู่ในรายการสั่งแล้ว</p>}
      </div>

      <div className={styles.field}>
        <p className={sheetStyles.label} id="order-strength">
          ความแรง (ไม่บังคับ)
        </p>
        <div className={styles.strengthRow}>
          <input
            className={sheetStyles.textInput}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="เช่น 500"
            aria-labelledby="order-strength"
            aria-invalid={strengthBad}
            value={strengthValue}
            onChange={(e) => setStrengthValue(e.target.value)}
          />
          <select className={styles.select} aria-label="หน่วยความแรง" value={strengthUnit} onChange={(e) => setStrengthUnit(e.target.value as (typeof STRENGTH_UNITS)[number])}>
            {STRENGTH_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        {strengthBad && <p className={sheetStyles.error}>ความแรงต้องเป็นตัวเลขมากกว่า 0</p>}
      </div>

      <div className={styles.field} role="group" aria-labelledby="order-kind">
        <p className={sheetStyles.label} id="order-kind">
          ชนิดยา*
        </p>
        <div className={styles.kinds}>
          {KIND_ORDER.map((k) => (
            <button key={k} type="button" className={kind === k ? `${styles.kindTile} ${styles.on}` : styles.kindTile} aria-pressed={kind === k} onClick={() => pickKind(k)}>
              <KindIcon kind={k} size={28} />
              <span>{KIND_LABEL[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field} role="group" aria-labelledby="order-unit">
        <p className={sheetStyles.label} id="order-unit">
          สั่งเป็น
        </p>
        {choices.custom ? (
          <input
            className={sheetStyles.textInput}
            type="text"
            autoComplete="off"
            placeholder="พิมพ์หน่วยที่สั่ง เช่น ถุง"
            aria-label="หน่วยที่สั่ง"
            maxLength={SELL_UNIT_MAX}
            value={sellUnit}
            onChange={(e) => setSellUnit(e.target.value)}
          />
        ) : (
          <div className={styles.pills}>
            {choices.units.map((u) => (
              <button key={u} type="button" className={sellUnit === u ? `${styles.pill} ${styles.on}` : styles.pill} aria-pressed={sellUnit === u} onClick={() => setSellUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        )}
        {tried && sellUnitEmpty && <p className={sheetStyles.error}>ใส่หน่วยที่สั่ง</p>}
      </div>

      <div className={styles.field}>
        <p className={sheetStyles.label} id="order-qty">
          จำนวนที่จะสั่ง*
        </p>
        <div className={styles.qtyRow}>
          <button type="button" className={styles.round} aria-label="ลดจำนวน" disabled={!qtyOk || (qtyNumber ?? 0) < 1} onClick={() => stepQty(-1)}>
            <MinusIcon />
          </button>
          <input className={styles.qtyInput} type="text" inputMode="numeric" aria-labelledby="order-qty" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} />
          <span className={styles.qtyUnit}>{sellUnit.trim() === '' ? 'หน่วย' : sellUnit}</span>
          <button type="button" className={styles.round} aria-label="เพิ่มจำนวน" onClick={() => stepQty(1)}>
            <PlusIcon />
          </button>
        </div>
        {asksPer && (
          <div className={styles.field}>
            <label className={sheetStyles.label} htmlFor={`${nameId}-per`}>
              {perUnitWord(kind)}ต่อ{sellUnit.trim()} (ไม่บังคับ)
            </label>
            <input
              id={`${nameId}-per`}
              className={sheetStyles.textInput}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="เช่น 30"
              aria-invalid={perBad}
              value={per}
              onChange={(e) => setPer(e.target.value)}
            />
            {perBad && <p className={sheetStyles.error}>ต้องเป็นตัวเลขมากกว่า 0</p>}
          </div>
        )}
      </div>

      <label className={styles.checkRow}>
        <input className={styles.check} type="checkbox" checked={addToList} onChange={(e) => setAddToList(e.target.checked)} />
        <span>หลังได้ยามา ถามว่าจะเพิ่มเข้ารายการยาไหม</span>
      </label>

      <button type="button" className={sheetStyles.primary} disabled={!canAdd} onClick={submit}>
        เพิ่มลงรายการสั่ง
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- change the sell unit

export function UnitSheet({ root, line, onSave, onClose }: { root: Root; line: DraftLine; onSave: (line: DraftLine) => void; onClose: () => void }) {
  const medId = line.source.kind === 'med' ? line.source.medicationId : null;
  const med = medId === null ? undefined : root.medications.find((m) => m.id === medId);
  const kind: MedKind = med?.kind ?? 'other';
  const choices = sellUnitChoices(kind, line.sellUnit);
  const [sellUnit, setSellUnit] = useState(line.sellUnit);
  const [per, setPer] = useState(String(line.perSellUnit ?? 1));

  if (line.source.kind === 'house' || !med) {
    // house medicine (and anything that is not a medicine of the app) cannot be changed: the page never opens this sheet for them
    return (
      <Sheet title="แก้หน่วยสั่ง" subtitle={line.name} onClose={onClose}>
        <div className={sheetStyles.body}>
          <p className={sheetStyles.hint}>ยาสามัญสั่งเป็นหน่วยเดียวกับที่นับสต็อก จึงแก้ไม่ได้</p>
          <div className={sheetStyles.actions}>
            <button type="button" className={sheetStyles.cancel} onClick={onClose}>
              ปิด
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  const asksPer = asksPerSellUnit(kind, sellUnit);
  const perNumber = asksPer ? toNumber(per) : 1;
  const perOk = perNumber !== null && perNumber > 0;
  const unitOk = sellUnit.trim() !== '';
  const choose = (u: string): void => {
    setSellUnit(u);
    const start = defaultPerSellUnit(med, u);
    setPer(String(u === line.sellUnit ? (line.perSellUnit ?? start ?? '') : (start ?? '')));
  };
  const save = (): void => {
    const res = changeSellUnit(line, { sellUnit, perSellUnit: perNumber ?? 0 });
    if (res.ok) onSave(res.line);
  };

  return (
    <Sheet title="แก้หน่วยสั่ง" subtitle={line.name} onClose={onClose}>
      <div className={sheetStyles.body}>
        <div className={styles.field} role="group" aria-labelledby="unit-as">
          <p className={sheetStyles.label} id="unit-as">
            สั่งเป็น
          </p>
          {choices.custom ? (
            <input
              className={sheetStyles.textInput}
              type="text"
              autoComplete="off"
              placeholder="พิมพ์หน่วยที่สั่ง เช่น ถุง"
              aria-label="หน่วยที่สั่ง"
              maxLength={SELL_UNIT_MAX}
              value={sellUnit}
              onChange={(e) => {
                setSellUnit(e.target.value);
                if (e.target.value.trim() === line.sellUnit) setPer(String(line.perSellUnit ?? ''));
              }}
            />
          ) : (
            <div className={styles.pills}>
              {choices.units.map((u) => (
                <button key={u} type="button" className={sellUnit === u ? `${styles.pill} ${styles.on}` : styles.pill} aria-pressed={sellUnit === u} onClick={() => choose(u)}>
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>
        {asksPer && (
          <div className={styles.field}>
            <label className={sheetStyles.label} htmlFor="unit-per">
              {perUnitWord(kind)}ต่อ{sellUnit.trim()}
            </label>
            <input id="unit-per" className={sheetStyles.textInput} type="text" inputMode="decimal" autoComplete="off" placeholder="เช่น 30" aria-invalid={!perOk} value={per} onChange={(e) => setPer(e.target.value)} />
            {!perOk && <p className={sheetStyles.error}>ใส่ตัวเลขมากกว่า 0</p>}
          </div>
        )}
        <p className={styles.sheetNote}>
          <InfoIcon />
          แก้เฉพาะใบนี้ ไม่เปลี่ยนข้อมูลยาในรายการยา
        </p>
        <div className={sheetStyles.actions}>
          <button type="button" className={sheetStyles.primary} disabled={!unitOk || !perOk} onClick={save}>
            ตกลง
          </button>
          <button type="button" className={sheetStyles.cancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </div>
    </Sheet>
  );
}
