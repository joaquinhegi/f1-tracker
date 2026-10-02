import styles from "./StatusMessage.module.css";

export interface StatusMessageProps {
  title: string;
  message?: string;
  tone?: "empty" | "error";
  action?: { label: string; onClick: () => void };
}

/** Empty / error state with an optional action (e.g. "Retry"). */
export function StatusMessage({ title, message, tone = "empty", action }: StatusMessageProps) {
  return (
    <div className={`${styles.status} ${tone === "error" ? styles.error : ""}`} role={tone === "error" ? "alert" : undefined}>
      <p className={styles.title}>{title}</p>
      {message && <p className={styles.message}>{message}</p>}
      {action && (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
