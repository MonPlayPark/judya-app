// The small "add a member" form inside the add-medicine step 1 (owner decision 5). The full members page is step 3.2c
// and will replace it. name + relation + "sets out their own medicine" -> addPerson.
import { useState } from 'react';
import { errorText } from '../domain/errorText';
import { RELATIONS } from '../domain/schema';
import type { Relation } from '../domain/medicine';
import { useData } from '../state/DataContext';
import { Button } from './Button';
import { Card } from './Card';
import { Actions, Chip, ChipGroup, Field, InfoBox, Switch, hintClass, inputClass } from './form';
import styles from './QuickAddMember.module.css';

export function QuickAddMember({ onAdded, onCancel }: { onAdded: (personId: string) => void; onCancel?: () => void }) {
  const { addPerson } = useData();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<Relation | null>(null);
  const [selfManaged, setSelfManaged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const hint = trimmed.length < 1 ? 'ใส่ชื่อสมาชิกก่อน' : relation === null ? 'เลือกว่าเป็นใครของเรา' : null;

  const save = () => {
    if (hint !== null || relation === null) return;
    const res = addPerson({ name: trimmed, relation, selfManaged });
    if (res.ok) {
      setError(null);
      onAdded(res.personId);
    } else {
      setError(errorText(res.error));
    }
  };

  return (
    <Card>
      <div className={styles.form}>
        <h2 className={styles.title}>เพิ่มสมาชิก</h2>
        <Field label="ชื่อสมาชิก">
          {(p) => <input {...p} type="text" className={inputClass} value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className={styles.form}>
          <span className={styles.sub}>เป็นใครของเรา</span>
          <ChipGroup label="เป็นใครของเรา">
            {RELATIONS.map((r) => (
              <Chip key={r} on={relation === r} onClick={() => setRelation(r)}>
                {r}
              </Chip>
            ))}
          </ChipGroup>
        </div>
        <div className={styles.form}>
          <Switch on={selfManaged} onChange={setSelfManaged}>
            จัดยาทานเอง
          </Switch>
          <p className={hintClass}>เปิดไว้ถ้าสมาชิกคนนี้จัดยาเอง ยาจะไม่ขึ้นในรายการยาวันนี้ แต่ยังนับสต๊อกและเตือนเมื่อใกล้หมด</p>
        </div>
        {error && <InfoBox tone="error">{error}</InfoBox>}
        <Actions hint={hint}>
          <Button disabled={hint !== null} onClick={save}>
            เพิ่มสมาชิก
          </Button>
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              ยกเลิก
            </Button>
          )}
        </Actions>
      </div>
    </Card>
  );
}
