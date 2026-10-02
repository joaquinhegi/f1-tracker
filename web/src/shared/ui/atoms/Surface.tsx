import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./Surface.module.css";

type SurfaceProps<T extends ElementType> = {
  as?: T;
  padded?: boolean;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children">;

/** Bordered card surface (openf1.org cards: 1px border, 8px radius). */
export function Surface<T extends ElementType = "div">({
  as,
  padded = true,
  className,
  children,
  ...rest
}: SurfaceProps<T>) {
  const Component: ElementType = as ?? "div";
  const classes = [styles.surface, padded && styles.padded, className].filter(Boolean).join(" ");
  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
