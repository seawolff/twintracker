import styles from './SwitchRow.module.scss';

interface SwitchRowProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SwitchRow({ id, label, hint, checked, onChange }: SwitchRowProps) {
  return (
    <label className={styles.switchRow} htmlFor={id}>
      <div className={styles.content}>
        <p className={styles.label}>{label}</p>
        <p className={styles.hint}>{hint}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        className={styles.input}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        aria-label={label}
      />
      <div className={`${styles.track} ${checked ? styles.trackOn : ''}`} />
    </label>
  );
}
