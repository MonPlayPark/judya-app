import { useId, type ReactNode } from 'react';
import { href } from '../router';
import { BackIcon, CheckCircleIcon, CheckIcon, InfoIcon, MinusIcon, PlusIcon, WarningIcon, XCircleIcon } from './icons';
import styles from './form.module.css';

/** A pill-shaped choice. Chosen = tick AND coloured (never colour alone).
 * role 'radio' = pick one, 'checkbox' = pick several, 'toggle' = a pressed button. */
export function Chip({
  on,
  role = 'radio',
  onClick,
  disabled,
  className,
  children,
}: {
  on: boolean;
  role?: 'radio' | 'checkbox' | 'toggle';
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const aria = role === 'toggle' ? { 'aria-pressed': on } : { role, 'aria-checked': on };
  return (
    <button
      type="button"
      className={`${styles.chip} ${on ? styles.chipOn : ''} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      {...aria}
    >
      {on && <CheckIcon />}
      {children}
    </button>
  );
}

/** The dashed "add" chip, e.g. "เพิ่มสมาชิก". */
export function AddChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`${styles.chip} ${styles.chipAdd}`} onClick={onClick}>
      <PlusIcon />
      {children}
    </button>
  );
}

export function ChipGroup({ label, role = 'radiogroup', children }: { label: string; role?: 'radiogroup' | 'group'; children: ReactNode }) {
  return (
    <div role={role} aria-label={label} className={styles.chips}>
      {children}
    </div>
  );
}

/** − / + with the value between them. `label` completes the button names: "ลด<label>" / "เพิ่ม<label>". */
export function Stepper({
  title,
  label,
  text,
  canMinus,
  canPlus,
  onMinus,
  onPlus,
}: {
  title: string;
  label: string;
  text: string;
  canMinus: boolean;
  canPlus: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className={styles.stepper}>
      <span className={styles.stepLabel}>{title}</span>
      <div className={styles.stepControls}>
        <button type="button" className={styles.stepBtn} aria-label={`ลด${label}`} disabled={!canMinus} onClick={onMinus}>
          <MinusIcon />
        </button>
        <span className={styles.stepText} aria-live="polite">
          {text}
        </span>
        <button type="button" className={styles.stepBtn} aria-label={`เพิ่ม${label}`} disabled={!canPlus} onClick={onPlus}>
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

const INFO_ICON = { info: <InfoIcon />, warn: <WarningIcon />, ok: <CheckCircleIcon />, error: <XCircleIcon /> };
const INFO_CLASS = { info: styles.infoInfo, warn: styles.infoWarn, ok: styles.infoOk, error: styles.infoError };

/** Coloured note with an icon. `error` and `ok` are announced to screen readers. */
export function InfoBox({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'error'; children: ReactNode }) {
  const role = tone === 'error' ? 'alert' : tone === 'ok' ? 'status' : undefined;
  return (
    <div className={`${styles.info} ${INFO_CLASS[tone]}`} role={role}>
      {INFO_ICON[tone]}
      <p>{children}</p>
    </div>
  );
}

/** Label + control (+ hint, + error). The control gets the id through the render function.
 * An error is read out as an alert and has an icon and words (never colour alone). */
export function Field({
  label,
  optional,
  hint,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (ไม่บังคับ)</span>}
      </label>
      {children(describedBy ? { id, 'aria-describedby': describedBy } : { id })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles.fieldError}>
          <XCircleIcon />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = styles.input ?? '';
export const textareaClass = `${styles.input} ${styles.textarea}`;
export const hintClass = styles.hint ?? '';
export const labelClass = styles.label ?? '';

/** On/off with the words "เปิด" / "ปิด" next to the tick (not colour alone). */
export function Switch({ on, onChange, children }: { on: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`${styles.switch} ${on ? styles.switchOn : ''}`} onClick={() => onChange(!on)}>
      <span>{children}</span>
      <span className={styles.switchState}>
        {on && <CheckIcon />}
        {on ? 'เปิด' : 'ปิด'}
      </span>
    </button>
  );
}

/** Back arrow + title (+ "ขั้น N จาก 3" line). */
export function StepHeader({ title, sub, backTo, backLabel }: { title: string; sub?: string; backTo: string; backLabel: string }) {
  return (
    <header className={styles.header}>
      <a className={styles.back} href={href(backTo)} aria-label={backLabel}>
        <BackIcon />
      </a>
      <div>
        <h1 className={styles.headerTitle}>{title}</h1>
        {sub && <div className={styles.headerSub}>{sub}</div>}
      </div>
    </header>
  );
}

/** Stack of buttons and, while the main one is off, the sentence saying what is missing. */
export function Actions({ hint, hintId, children }: { hint?: string | null; hintId?: string; children: ReactNode }) {
  return (
    <div className={styles.actions}>
      {children}
      {hint && (
        <p id={hintId} className={styles.actionHint}>
          {hint}
        </p>
      )}
    </div>
  );
}
