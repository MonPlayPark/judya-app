import { useMemo, useState } from 'react';
import { formatPills } from '../domain/format';
import { compareShops, orderLines, type OrderLine, type ShopRow } from '../domain/order';
import { effectiveLines, pickShop, stepQty } from '../domain/orderPage';
import { buildOrderMessage, messageLines } from '../domain/orderMessage';
import type { Shop } from '../domain/schema';
import { Card, CardTitle, Pill } from '../components/Card';
import { InfoBox, StepHeader, Switch } from '../components/form';
import { BagIcon, CheckCircleIcon, CheckIcon, ChatIcon, CopyIcon, EditIcon, InfoIcon, MinusIcon, PhoneIcon, PlusIcon, WarningIcon } from '../components/icons';
import { href } from '../router';
import { useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import styles from './OrderPage.module.css';

const LINE_URL = 'https://line.me/R/msg/text/?';
const COPY_FAIL = 'คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วเลือกคัดลอกเอง';

const baht = (n: number): string => `฿${n}`;

/** '#/meds/:assignmentId' for a regular medicine (any member who uses it: the price is shared), '#/house/:id' for a house medicine. */
const lineHref = (l: OrderLine): string =>
  l.kind === 'house' ? href(`/house/${encodeURIComponent(l.houseItemId)}`) : href(`/meds/${encodeURIComponent(l.assignmentIds[0] ?? '')}`);

/** The order page (board 6 Order, BRIEF S10). It reads the house and writes nothing: the quantities, ticks, chosen shop and shipping
 * switch live in this page only, so leaving it starts again from `orderLines`. */
export function OrderPage() {
  const root = useRoot();
  const { today } = useToday();
  const base = useMemo(() => orderLines(root, today), [root, today]);
  const [qtyOverride, setQtyOverride] = useState<Record<string, number>>({});
  const [tickOverride, setTickOverride] = useState<Record<string, boolean>>({});
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [includeShipping, setIncludeShipping] = useState(true);
  const [copied, setCopied] = useState<{ text: string; ok: boolean } | null>(null);

  const lines = effectiveLines(base, qtyOverride, tickOverride);
  const wanted = lines.filter((l) => l.ticked && l.qty > 0);
  const { rows, missing } = compareShops(lines, root.shops, root.prices, includeShipping);
  const chosen = pickShop(rows, chosenId);
  const chosenShop = chosen ? root.shops.find((s) => s.id === chosen.shopId) : undefined;

  const message =
    wanted.length === 0 ? '' : buildOrderMessage(root.settings.orderTemplate, chosen?.shopName ?? null, messageLines(lines, chosen));

  const toggle = (l: OrderLine) => setTickOverride((t) => ({ ...t, [l.key]: !l.ticked }));
  const perSellUnitOf = (l: OrderLine): number | null =>
    l.kind === 'med' ? (chosen?.lines.find((p) => p.key === l.key)?.perSellUnit ?? null) : null;
  const step = (l: OrderLine, dir: 'up' | 'down') => setQtyOverride((q) => ({ ...q, [l.key]: stepQty(l, dir, perSellUnitOf(l)) }));

  const copy = async () => {
    const text = message;
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ text, ok: true });
    } catch {
      setCopied({ text, ok: false });
    }
  };
  const copyNote = copied && copied.text === message ? copied : null; // a note belongs to the text that was copied

  return (
    <>
      <StepHeader title="สั่งยา" backTo="/" backLabel="กลับหน้าแรก" />
      <div className={styles.body}>
        <Card>
          <CardTitle icon={<BagIcon />}>ยาที่ต้องสั่ง</CardTitle>
          {base.length === 0 ? (
            <div className={styles.cardBody}>
              <InfoBox>ตอนนี้ยังไม่มียาที่ต้องสั่ง</InfoBox>
            </div>
          ) : (
            <>
              <p className={styles.hint}>รวมของทุกคนในบ้านและยาสามัญที่ใกล้หมด ติ๊กยาที่ต้องการสั่ง แล้วปรับจำนวนด้วย − และ +</p>
              <ul className={styles.lines}>
                {lines.map((l) => (
                  <LineRow
                    key={l.key}
                    line={l}
                    priced={chosen?.lines.find((p) => p.key === l.key)}
                    canStepDown={stepQty(l, 'down', perSellUnitOf(l)) < l.qty}
                    onToggle={() => toggle(l)}
                    onStep={(dir) => step(l, dir)}
                  />
                ))}
              </ul>
            </>
          )}
        </Card>

        {base.length > 0 && wanted.length === 0 && (
          <Card>
            <div className={styles.cardBody}>
              <InfoBox>ติ๊กยาที่ต้องการสั่งก่อน</InfoBox>
            </div>
          </Card>
        )}

        {wanted.length > 0 && (
          <>
            <CompareCard
              shops={root.shops}
              rows={rows}
              chosenId={chosen?.shopId ?? null}
              includeShipping={includeShipping}
              onShipping={setIncludeShipping}
              onChoose={setChosenId}
            />
            {missing.length > 0 && (
              <Card>
                <h2 className={styles.heading}>ร้านที่ยังไม่มีราคาครบ</h2>
                <p className={styles.hint}>ใส่ราคายาที่ขาด ร้านนี้จะเข้ามาเทียบให้</p>
                {missing.map((m) => (
                  <div key={m.shopId} className={styles.missShop}>
                    <h3 className={styles.missName}>{m.shopName}</h3>
                    <ul className={styles.missList}>
                      {m.keys.map((k) => {
                        const l = lines.find((x) => x.key === k);
                        if (!l) return null;
                        return (
                          <li key={k}>
                            <a className={styles.missLink} href={lineHref(l)} aria-label={`ใส่ราคา ${l.name} ของ ${m.shopName}`}>
                              <span>ยังไม่มีราคา {l.name}</span>
                              <span className={styles.missGo}>ใส่ราคา</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </Card>
            )}

            <Card>
              <CardTitle icon={<ChatIcon />}>ข้อความสั่งยา</CardTitle>
              <div className={styles.cardBody}>
                <pre className={styles.message} aria-label="ข้อความสั่งยา">
                  {message}
                </pre>
                <a className={styles.editLink} href={href('/settings')}>
                  <EditIcon />
                  แก้ข้อความที่ตั้งค่า
                </a>
                <InfoBox>แอพไม่ส่งข้อความให้เอง คัดลอกข้อความนี้ แล้วเปิด LINE เพื่อวางและส่งด้วยตัวคุณเอง</InfoBox>
              </div>
            </Card>

            <div className={styles.actions}>
              <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={copy}>
                <CopyIcon />
                คัดลอกข้อความ
              </button>
              {copyNote && (
                <p role="status" className={`${styles.note} ${copyNote.ok ? styles.noteOk : styles.noteWarn}`}>
                  {copyNote.ok ? <CheckCircleIcon /> : <WarningIcon />}
                  {copyNote.ok ? 'คัดลอกแล้ว' : COPY_FAIL}
                </p>
              )}
              <a className={`${styles.action} ${styles.actionSecondary}`} href={LINE_URL + encodeURIComponent(message)} target="_blank" rel="noopener noreferrer">
                <ChatIcon />
                เปิด LINE
              </a>
              {chosenShop?.phone && (
                <>
                  <a className={`${styles.action} ${styles.actionSecondary}`} href={`tel:${chosenShop.phone.replace(/[\s-]/g, '')}`}>
                    <PhoneIcon />
                    โทรหาร้าน
                  </a>
                  <p className={styles.callHint}>แอพจะเปิดหน้าโทรให้ คุณกดโทรเอง</p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function LineRow({
  line,
  priced,
  canStepDown,
  onToggle,
  onStep,
}: {
  line: OrderLine;
  priced: ShopRow['lines'][number] | undefined;
  canStepDown: boolean;
  onToggle: () => void;
  onStep: (dir: 'up' | 'down') => void;
}) {
  const none = line.qty <= 0;
  const qtyText = line.kind === 'med' ? formatPills(line.qty, line.unit) : `${line.qty} ${priced?.sellUnit ?? line.unit}`;
  return (
    <li className={styles.line}>
      <button type="button" role="checkbox" aria-checked={line.ticked} disabled={none} className={styles.check} onClick={onToggle}>
        <span className={`${styles.box} ${line.ticked ? styles.boxOn : ''}`}>{line.ticked && <CheckIcon />}</span>
        <span className={styles.lineText}>
          <span className={styles.name}>{line.name}</span>
          <span className={styles.reason}>
            {line.reason === 'low' ? (
              <Pill tone="warning" icon={<WarningIcon />}>
                ใกล้หมด
              </Pill>
            ) : (
              <Pill tone="neutral" icon={<InfoIcon />}>
                ไม่ทราบสต๊อก
              </Pill>
            )}
          </span>
        </span>
      </button>
      <div className={styles.stepper}>
        <button type="button" className={styles.stepBtn} aria-label={`ลดจำนวน ${line.name}`} disabled={!canStepDown} onClick={() => onStep('down')}>
          <MinusIcon />
        </button>
        <span className={styles.qty} aria-live="polite">
          {qtyText}
        </span>
        <button type="button" className={styles.stepBtn} aria-label={`เพิ่มจำนวน ${line.name}`} onClick={() => onStep('up')}>
          <PlusIcon />
        </button>
      </div>
      {line.kind === 'med' && priced && (
        <p className={styles.sellHint}>
          = {priced.sellUnits} {priced.sellUnit} ({priced.sellUnit}ละ {formatPills(priced.perSellUnit, line.unit)})
        </p>
      )}
      {none && <p className={styles.enough}>ของที่มีอยู่พอแล้ว จึงไม่ต้องสั่ง กด + ถ้าต้องการสั่งเพิ่ม</p>}
    </li>
  );
}

function CompareCard({
  shops,
  rows,
  chosenId,
  includeShipping,
  onShipping,
  onChoose,
}: {
  shops: readonly Shop[];
  rows: readonly ShopRow[];
  chosenId: string | null;
  includeShipping: boolean;
  onShipping: (on: boolean) => void;
  onChoose: (id: string) => void;
}) {
  return (
    <Card>
      <h2 className={styles.heading}>เทียบราคา</h2>
      {shops.length === 0 ? (
        <div className={styles.cardBody}>
          <p className={styles.state}>
            <InfoIcon />
            <strong>ยังไม่มีร้านค้า</strong>
          </p>
          <a className={styles.editLink} href={href('/settings')}>
            เพิ่มร้านค้าในตั้งค่า
          </a>
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.cardBody}>
          <InfoBox tone="warn">ยังไม่มีร้านที่มีราคาครบทุกรายการที่ติ๊ก ใส่ราคาของยาที่ขาดในส่วนด้านล่าง เพื่อให้ร้านเข้ามาเทียบ</InfoBox>
        </div>
      ) : (
        <div className={styles.cardBody}>
          <Switch on={includeShipping} onChange={onShipping}>
            รวมค่าส่ง
          </Switch>
          <p className={styles.hint}>แตะร้านที่จะสั่ง ราคารวมคิดจากหน่วยเต็มที่ร้านขาย</p>
          <div role="radiogroup" aria-label="เลือกร้านที่จะสั่ง" className={styles.shops}>
            {rows.map((r, i) => {
              const shop = shops.find((s) => s.id === r.shopId);
              const on = r.shopId === chosenId;
              const delivers = shop?.delivery.kind === 'deliver';
              return (
                <button
                  key={r.shopId}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`${styles.shop} ${on ? styles.shopOn : ''}`}
                  onClick={() => onChoose(r.shopId)}
                >
                  <span className={styles.shopTop}>
                    <span className={styles.shopName}>{r.shopName}</span>
                    <span className={styles.shopTotal}>{baht(r.total)}</span>
                  </span>
                  <span className={styles.shopLine}>{delivers ? 'ส่งถึงบ้าน' : 'รับเอง'}</span>
                  {delivers && <span className={styles.shopLine}>{r.shipping === 0 ? 'ส่งฟรี' : `ค่าส่ง ${baht(r.shipping)}`}</span>}
                  {r.buyMore !== null && <span className={styles.shopLine}>ซื้อเพิ่มอีก {baht(r.buyMore)} ส่งฟรี</span>}
                  {(i === 0 || on) && (
                    <span className={styles.shopChips}>
                      {i === 0 && (
                        <Pill tone="success" icon={<CheckCircleIcon />}>
                          ถูกที่สุด
                        </Pill>
                      )}
                      {on && (
                        <Pill tone="info" icon={<CheckIcon />}>
                          สั่งร้านนี้
                        </Pill>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
