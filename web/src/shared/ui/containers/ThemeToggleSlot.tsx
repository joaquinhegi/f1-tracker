"use client";

import dynamic from "next/dynamic";
import styles from "@/shared/ui/molecules/ThemeToggle.module.css";

/**
 * The theme toggle, loaded on the client only. The server cannot know the
 * stored mode anyway, and keeping the toggle out of the server HTML keeps
 * the layout's hydration as light as before (see the README). A same-size
 * placeholder holds its place, so nothing shifts when it appears.
 */
export const ThemeToggleSlot = dynamic(() => import("./ThemeToggleContainer").then((m) => m.ThemeToggleContainer), {
  ssr: false,
  loading: () => <span className={styles.placeholder} aria-hidden="true" />,
});
