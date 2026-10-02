"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Secondary line, e.g. a day and time. */
  meta?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
  /** id of the tabpanel these tabs control. */
  panelId: string;
}

/** WAI-ARIA tablist: arrow keys / Home / End move focus and select. */
export function Tabs({ items, selectedId, onSelect, ariaLabel, panelId }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);

  // On narrow screens the list scrolls: keep the selected tab visible.
  useEffect(() => {
    refs.current[selectedIndex]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedIndex]);

  const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const position = enabled.findIndex((e) => e.index === index);
    let target: number | undefined;
    if (event.key === "ArrowRight") target = enabled[(position + 1) % enabled.length]?.index;
    else if (event.key === "ArrowLeft") target = enabled[(position - 1 + enabled.length) % enabled.length]?.index;
    else if (event.key === "Home") target = enabled[0]?.index;
    else if (event.key === "End") target = enabled.at(-1)?.index;
    if (target === undefined) return;
    event.preventDefault();
    refs.current[target]?.focus();
    onSelect(items[target].id);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={styles.list}>
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected || (selectedId === null && index === 0) ? 0 : -1}
            disabled={item.disabled}
            className={styles.tab}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={styles.label}>
              {item.label}
              {item.badge}
            </span>
            {item.meta && <span className={styles.meta}>{item.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}
