// "ราคาตามร้าน" (boards Med* and EditHouse*): one row per shop, and the form to put, change or delete one price. Used by the
// regular-medicine page (`unit` = its unit, asks "1 {sell unit} has how many {unit}") and the house-medicine page (`unit` null,
// the price is for 1 sell unit). Saving and deleting go through DataContext only (`setPrice`, `deletePrice`).
import { useState } from 'react';
import { errorText } from '../domain/errorText';
import { validatePrice, type PriceField } from '../domain/price';
import {
  blankPriceForm,
  PRICE_UNIT_CHIPS,
  priceFormFromPrice,
  priceFormToInput,
  priceText,
  shopPriceRows,
  type PriceForm,
} from '../domain/priceView';
import type { Price } from '../domain/schema';
import { href } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { Button } from './Button';
import { Card } from './Card';
import { ClearSampleDialog } from './ClearSampleDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { Actions, Chip, ChipGroup, Field, InfoBox, inputClass } from './form';
import styles from './PriceSection.module.css';

type Errors = Partial<Record<PriceField, string>>;

export function PriceSection({
  item,
  unit,
  sharedCount,
  lead,
}: {
  item: Price['item'];
  /** The medicine's own unit for a regular medicine; null for a house medicine. */
  unit: string | null;
  /** How many members use the medicine now. The "shared price" sentence shows when this is more than 1. */
  sharedCount?: number;
  lead: string;
}) {
  const root = useRoot();
  const { setPrice, deletePrice } = useData();
  const [editing, setEditing] = useState<string | null>(null); // shop id
  const [form, setForm] = useState<PriceForm>(blankPriceForm);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [askClear, setAskClear] = useState(false);

  const rows = shopPriceRows(root, item);
  const row = rows.find((r) => r.shop.id === editing);
  const kind = item.kind;

  const open = (shopId: string, price: Price | undefined) => {
    setEditing(shopId);
    setForm(price ? priceFormFromPrice(price) : blankPriceForm());
    setErrors({});
    setError(null);
    setDone(null);
  };
  const close = () => {
    setEditing(null);
    setErrors({});
    setError(null);
  };
  const change = (patch: Partial<PriceForm>, field: PriceField) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setError(null);
  };

  const save = () => {
    if (!row) return;
    const input = priceFormToInput(kind, form);
    const check = validatePrice(kind, input); // shows every wrong box at once
    if (!check.ok) {
      const next: Errors = {};
      for (const [field, code] of Object.entries(check.errors) as [PriceField, Parameters<typeof errorText>[0]][]) next[field] = errorText(code);
      setErrors(next);
      return;
    }
    const res = setPrice({ shopId: row.shop.id, item, ...input });
    if (res.ok) {
      setDone(`บันทึกราคาของ ${row.shop.name} แล้ว`);
      close();
    } else if (res.error === 'sample_present') setAskClear(true);
    else setError(errorText(res.error));
  };

  const remove = () => {
    if (!row?.price) return;
    const res = deletePrice(row.price.id);
    setConfirmDelete(false);
    if (res.ok) {
      setDone(`ลบราคาของ ${row.shop.name} แล้ว`);
      close();
    } else setError(errorText(res.error));
  };

  const sellUnit = form.sellUnit.trim();
  return (
    <Card>
      <h2 className={styles.title}>ราคาตามร้าน</h2>
      <p className={styles.hint}>{lead}</p>
      {sharedCount !== undefined && sharedCount > 1 && <p className={styles.hint}>ราคานี้ใช้ร่วมกับทุกคนที่ใช้ยานี้ ({sharedCount} คน)</p>}
      <div className={styles.stack}>
        {rows.length === 0 && (
          <a className={styles.noShops} href={href('/settings')}>
            ยังไม่มีร้านค้า เพิ่มร้านในตั้งค่า
          </a>
        )}
        {rows.map(({ shop, price }) => (
          <div key={shop.id} className={styles.row}>
            <div className={styles.rowText}>
              <div className={styles.shopName}>{shop.name}</div>
              <div className={`${styles.sub} ${price ? styles.subHas : ''}`}>{price ? priceText(price, unit) : 'ยังไม่ใส่ราคา'}</div>
            </div>
            <button
              type="button"
              className={styles.rowBtn}
              aria-label={`${price ? 'แก้ไขราคา' : 'ใส่ราคา'} ${shop.name}`}
              onClick={() => open(shop.id, price)}
            >
              {price ? 'แก้ไข' : 'ใส่ราคา'}
            </button>
          </div>
        ))}
        {done && <InfoBox tone="ok">{done}</InfoBox>}

        {row && (
          <div className={styles.form}>
            <h3 className={styles.formTitle}>ราคาของ {row.shop.name}</h3>
            <Field label="ราคา (บาท)" {...(errors.price ? { error: errors.price } : {})}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className={inputClass}
                  value={form.price}
                  placeholder="เช่น 290"
                  aria-invalid={errors.price ? true : undefined}
                  onChange={(e) => change({ price: e.target.value }, 'price')}
                />
              )}
            </Field>
            <div className={styles.group}>
              <span className={styles.label}>{unit === null ? 'ราคานี้ต่อ 1 หน่วยที่ร้านขาย' : 'หน่วยที่ร้านขาย'}</span>
              <ChipGroup label="หน่วยที่ร้านขาย">
                {PRICE_UNIT_CHIPS.map((u) => (
                  <Chip key={u} on={sellUnit === u} onClick={() => change({ sellUnit: u }, 'sellUnit')}>
                    {u}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
            <Field label="หรือพิมพ์หน่วยเอง" {...(errors.sellUnit ? { error: errors.sellUnit } : {})}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  className={inputClass}
                  value={form.sellUnit}
                  maxLength={12}
                  placeholder="เช่น ถุง"
                  autoComplete="off"
                  aria-invalid={errors.sellUnit ? true : undefined}
                  onChange={(e) => change({ sellUnit: e.target.value }, 'sellUnit')}
                />
              )}
            </Field>
            {unit !== null && (
              <Field
                label={`1 ${sellUnit || 'หน่วยที่ร้านขาย'} มีกี่ ${unit}`}
                {...(errors.perSellUnit ? { error: errors.perSellUnit } : {})}
              >
                {(p) => (
                  <input
                    {...p}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    className={inputClass}
                    value={form.perSellUnit}
                    placeholder="เช่น 60"
                    aria-invalid={errors.perSellUnit ? true : undefined}
                    onChange={(e) => change({ perSellUnit: e.target.value }, 'perSellUnit')}
                  />
                )}
              </Field>
            )}
            {error && <InfoBox tone="error">{error}</InfoBox>}
            <Actions>
              <Button onClick={save}>บันทึกราคา</Button>
              <Button variant="secondary" onClick={close}>
                ยกเลิก
              </Button>
              {row.price && (
                <Button variant="dangerOutline" onClick={() => setConfirmDelete(true)}>
                  ลบราคานี้
                </Button>
              )}
            </Actions>
          </div>
        )}
      </div>

      {confirmDelete && row?.price && (
        <ConfirmDialog title={`ลบราคาของ ${row.shop.name}?`} confirmLabel="ลบราคา" onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
          ลบเฉพาะราคานี้ ร้านและยายังอยู่เหมือนเดิม
        </ConfirmDialog>
      )}
      {askClear && root.meta.isSample && <ClearSampleDialog onCancel={() => setAskClear(false)} />}
    </Card>
  );
}
