// Settings: "ข้อความสั่งยาไปร้าน" (board Settings). The text sent to a shop, with {ร้าน} and {รายการ}. A text box does not save
// every letter typed, so it has its own save button. A text that is empty or exactly the default is stored as '' (= "use the
// default"). The preview below is made with `buildOrderMessage` from a made-up shop and two made-up lines; it follows the box at once.
import { useEffect, useRef, useState } from 'react';
import { settingsErrorText } from '../domain/errorText';
import { buildOrderMessage, DEFAULT_ORDER_TEMPLATE, type MessageLine } from '../domain/orderMessage';
import { Button } from '../components/Button';
import { Card, CardTitle } from '../components/Card';
import { Actions, Chip, ChipGroup, Field, InfoBox, textareaClass } from '../components/form';
import { ChatIcon } from '../components/icons';
import { useData, useRoot } from '../state/DataContext';
import styles from './OrderMessageCard.module.css';

const SAMPLE_SHOP = 'ร้านตัวอย่าง';
const SAMPLE_LINES: MessageLine[] = [
  { kind: 'med', name: 'ยาตัวอย่าง เอ', unit: 'เม็ด', qty: 60, buy: { sellUnits: 2, sellUnit: 'กล่อง', perSellUnit: 30 } },
  { kind: 'house', name: 'ยาสามัญตัวอย่าง', unit: 'ขวด', qty: 1, buy: { sellUnits: 1, sellUnit: 'ขวด' } },
];

export function OrderMessageCard() {
  const root = useRoot();
  const { setSettings } = useData();
  const stored = root.settings.orderTemplate;
  const shown = stored === '' ? DEFAULT_ORDER_TEMPLATE : stored; // what is really used
  const [draft, setDraft] = useState(shown);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // The box follows the saved text when it changes from outside (a restored backup).
  useEffect(() => setDraft(shown), [shown]);

  const edit = (text: string) => {
    setDraft(text);
    setSaved(false);
    setError(null);
  };

  /** Puts a placeholder where the cursor is (typing curly brackets on a phone keyboard is hard). */
  const insert = (token: string) => {
    const el = box.current;
    const at = el ? el.selectionStart : draft.length;
    const end = el ? el.selectionEnd : draft.length;
    edit(draft.slice(0, at) + token + draft.slice(end));
  };

  const save = () => {
    const value = draft === DEFAULT_ORDER_TEMPLATE ? '' : draft; // '' stays '' (the default text is shown in the box)
    const res = setSettings({ orderTemplate: value });
    if (res.ok) {
      setSaved(true);
      setError(null);
      if (value === '') setDraft(DEFAULT_ORDER_TEMPLATE);
    } else {
      setSaved(false);
      setError(settingsErrorText(res.error));
    }
  };

  const noList = !draft.includes('{รายการ}');
  return (
    <Card>
      <CardTitle icon={<ChatIcon />}>ข้อความสั่งยาไปร้าน</CardTitle>
      <div className={styles.stack}>
        <p className={styles.hint}>
          ใช้เป็นข้อความตั้งต้นตอนส่งหาร้าน {'{ร้าน}'} = ชื่อร้านที่เลือก {'{รายการ}'} = รายการยาที่สั่ง แอพจะแทนค่าให้ตอนสั่งยา
          ในข้อความไม่มีชื่อสมาชิก
        </p>
        <ChipGroup label="ใส่ตัวแทนในข้อความ" role="group">
          <Chip role="toggle" on={false} onClick={() => insert('{ร้าน}')}>
            ใส่ {'{ร้าน}'}
          </Chip>
          <Chip role="toggle" on={false} onClick={() => insert('{รายการ}')}>
            ใส่ {'{รายการ}'}
          </Chip>
        </ChipGroup>
        <Field label="ข้อความ">
          {(p) => (
            <textarea {...p} ref={box} rows={7} className={textareaClass} value={draft} onChange={(e) => edit(e.target.value)} />
          )}
        </Field>
        {noList && <InfoBox tone="warn">ในข้อความไม่มี {'{รายการ}'} แอพจะต่อรายการยาไว้ท้ายข้อความให้</InfoBox>}
        {error && <InfoBox tone="error">{error}</InfoBox>}
        <Actions>
          <Button onClick={save}>บันทึกข้อความ</Button>
          <Button variant="secondary" onClick={() => edit(DEFAULT_ORDER_TEMPLATE)}>
            ใช้ข้อความตั้งต้น
          </Button>
        </Actions>
        {saved && <InfoBox tone="ok">บันทึกแล้ว</InfoBox>}
        <h3 className={styles.previewTitle}>ตัวอย่างที่ร้านจะเห็น</h3>
        <pre className={styles.preview} aria-label="ตัวอย่างข้อความ">
          {buildOrderMessage(draft, SAMPLE_SHOP, SAMPLE_LINES)}
        </pre>
        <p className={styles.hint}>ตัวอย่างนี้ใช้ร้านและยาสมมติ เปลี่ยนตามข้อความในช่องทันที แต่ยังไม่บันทึกจนกว่าจะกด “บันทึกข้อความ”</p>
      </div>
    </Card>
  );
}
