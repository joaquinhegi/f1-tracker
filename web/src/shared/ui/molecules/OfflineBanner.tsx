"use client";

import { useOnline } from "@/shared/ui/hooks/use-online";
import styles from "./OfflineBanner.module.css";

/** Shown while the browser is offline; data polling resumes on reconnect. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className={styles.banner} role="status">
      You are offline. Showing the last data received; updates resume when the connection is back.
    </div>
  );
}
