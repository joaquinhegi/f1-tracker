import Link from "next/link";
import { ThemeToggleSlot } from "@/shared/ui/containers/ThemeToggleSlot";
import styles from "./SiteHeader.module.css";

/** Sticky, blurred top bar in the openf1.org style, with the theme toggle on the right. */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main">
        <Link href="/" className={styles.logo}>
          F1<span>Live</span>
        </Link>
        <span className={styles.tagline}>Live timing, circuit map and team radio</span>
        <div className={styles.actions}>
          <ThemeToggleSlot />
        </div>
      </nav>
    </header>
  );
}
