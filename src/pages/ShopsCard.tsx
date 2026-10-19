// Settings: the shops (board Settings, section "ร้านค้า"). List, add, edit, delete. The inline form follows the board;
// deleting asks first and says the prices of that shop go too. Prices per shop are in the medicine pages (PriceSection).
import { useEffect, useState } from 'react';
import { errorText } from '../domain/errorText';
import { blankShopForm, shopFormFromShop, shopFormToInput, shopSub, validateShop, type ShopField, type ShopFieldError, type ShopForm } from '../domain/shop';
import type { Shop } from '../domain/schema';
import { Button } from '../components/Button';
import { Card, CardTitle } from '../components/Card';
import { ClearSampleDialog } from '../components/ClearSampleDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AddChip, Actions, Chip, ChipGroup, Field, InfoBox, inputClass } from '../components/form';
import { BagIcon } from '../components/icons';
import { useData, useRoot } from '../state/DataContext';
import styles from './ShopsCard.module.css';

type Errors = Partial<Record<ShopField, ShopFieldError>>;

/** null = no form open, 'new' = adding, otherwise the id of the shop being edited. */
type Editing = null | 'new' | string;

function saveHint(errors: Errors): string | null {
  if (errors.name) return 'พิมพ์ชื่อร้านอย่างน้อย 2 ตัวอักษร';
  if (errors.phone || errors.fee || errors.freeOver) return 'แก้ช่องที่มีข้อความเตือนก่อน แล้วค่อยกดบันทึก';
  return null;
}

export function ShopsCard() {
  const root = useRoot();
  const { addShop, editShop, deleteShop } = useData();
  const [editing, setEditing] = useState<Editing>(null);
  const [form, setForm] = useState<ShopForm>(blankShopForm);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [askClear, setAskClear] = useState(false);

  // The sample box closes itself once the sample is gone.
  useEffect(() => {
    if (!root.meta.isSample) setAskClear(false);
  }, [root.meta.isSample]);

  const shop = editing && editing !== 'new' ? root.shops.find((s) => s.id === editing) : undefined;
  const check = validateShop(shopFormToInput(form));
  const errors: Errors = check.ok ? {} : check.errors;
  const hint = saveHint(errors);
  const change = (patch: Partial<ShopForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };

  const open = (which: Editing, f: ShopForm) => {
    setEditing(which);
    setForm(f);
    setDone(null);
    setError(null);
  };
  const startAdd = () => {
    if (root.meta.isSample) setAskClear(true); // O5: real data is not added on top of the sample
    else open('new', blankShopForm());
  };
  const close = () => {
    setEditing(null);
    setError(null);
  };

  const save = () => {
    if (hint !== null || !check.ok) return;
    const input = shopFormToInput(form);
    const res = editing === 'new' ? addShop(input) : editing ? editShop(editing, input) : null;
    if (!res) return;
    if (res.ok) {
      setDone(`บันทึกร้าน ${check.value.name} แล้ว`);
      close();
    } else if (res.error === 'sample_present') setAskClear(true);
    else setError(errorText(res.error));
  };

  const remove = () => {
    if (!shop) return;
    const res = deleteShop(shop.id);
    setConfirmDelete(false);
    if (res.ok) {
      setDone(`ลบร้าน ${shop.name} แล้ว`);
      close();
    } else setError(errorText(res.error));
  };

  const priceCount = shop ? root.prices.filter((p) => p.shopId === shop.id).length : 0;

  return (
    <Card>
      <CardTitle icon={<BagIcon />}>ร้านค้า</CardTitle>
      <div className={styles.stack}>
        <p className={styles.hint}>ร้านที่คุณซื้อยา ใช้เทียบราคาและส่งข้อความสั่งยา</p>
        {root.shops.length === 0 && <p className={styles.empty}>ยังไม่มีร้านค้า</p>}
        {root.shops.map((s) => (
          <ShopRow key={s.id} shop={s} onEdit={() => open(s.id, shopFormFromShop(s))} />
        ))}
        {done && <InfoBox tone="ok">{done}</InfoBox>}
        {editing === null && <AddChip onClick={startAdd}>เพิ่มร้านค้า</AddChip>}

        {editing !== null && (
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{editing === 'new' ? 'เพิ่มร้านค้า' : 'แก้ไขร้านค้า'}</h3>
            <Field label="ชื่อร้าน">
              {(p) => (
                <input
                  {...p}
                  type="text"
                  className={inputClass}
                  value={form.name}
                  maxLength={40}
                  placeholder="เช่น ร้านหมอยาเภสัช"
                  autoComplete="off"
                  onChange={(e) => change({ name: e.target.value })}
                />
              )}
            </Field>
            <Field label="เบอร์โทร" optional {...(errors.phone ? { error: errorText(errors.phone) } : {})}>
              {(p) => (
                <input
                  {...p}
                  type="tel"
                  inputMode="tel"
                  className={inputClass}
                  value={form.phone}
                  autoComplete="off"
                  aria-invalid={errors.phone ? true : undefined}
                  onChange={(e) => change({ phone: e.target.value })}
                />
              )}
            </Field>
            <div className={styles.group}>
              <span className={styles.label}>การรับยา</span>
              <ChipGroup label="การรับยา">
                <Chip on={form.ship === 'pickup'} onClick={() => change({ ship: 'pickup' })}>
                  ไปรับเองที่ร้าน
                </Chip>
                <Chip on={form.ship === 'deliver'} onClick={() => change({ ship: 'deliver' })}>
                  ให้ร้านส่ง
                </Chip>
              </ChipGroup>
            </div>
            {form.ship === 'deliver' && (
              <>
                <Field label="ค่าส่ง (บาท)" hint="ใส่ 0 ถ้าร้านส่งฟรีทุกครั้ง" {...(errors.fee ? { error: errorText(errors.fee) } : {})}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className={inputClass}
                      value={form.fee}
                      placeholder="เช่น 40"
                      aria-invalid={errors.fee ? true : undefined}
                      onChange={(e) => change({ fee: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="ส่งฟรีเมื่อซื้อครบ (บาท)" optional {...(errors.freeOver ? { error: errorText(errors.freeOver) } : {})}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className={inputClass}
                      value={form.freeOver}
                      placeholder="เช่น 1000"
                      aria-invalid={errors.freeOver ? true : undefined}
                      onChange={(e) => change({ freeOver: e.target.value })}
                    />
                  )}
                </Field>
              </>
            )}
            {error && <InfoBox tone="error">{error}</InfoBox>}
            <Actions hint={hint} hintId="shop-save-hint">
              <Button disabled={hint !== null} aria-describedby={hint ? 'shop-save-hint' : undefined} onClick={save}>
                บันทึก
              </Button>
              <Button variant="secondary" onClick={close}>
                ยกเลิก
              </Button>
              {shop && (
                <Button variant="dangerOutline" onClick={() => setConfirmDelete(true)}>
                  ลบร้านนี้
                </Button>
              )}
            </Actions>
          </div>
        )}
      </div>

      {confirmDelete && shop && (
        <ConfirmDialog title={`ลบ ${shop.name}?`} confirmLabel="ลบ" onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
          ราคาที่ใส่ไว้ของร้านนี้จะหายไปด้วย{priceCount > 0 ? ` (${priceCount} รายการ)` : ''}
        </ConfirmDialog>
      )}
      {askClear && root.meta.isSample && <ClearSampleDialog onCancel={() => setAskClear(false)} />}
    </Card>
  );
}

function ShopRow({ shop, onEdit }: { shop: Shop; onEdit: () => void }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.shopName}>{shop.name}</div>
        <div className={styles.sub}>{shopSub(shop)}</div>
      </div>
      <button type="button" className={styles.editBtn} aria-label={`แก้ไขร้าน ${shop.name}`} onClick={onEdit}>
        แก้ไข
      </button>
    </div>
  );
}
