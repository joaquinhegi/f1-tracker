import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
}

/** Loading placeholder block (decorative: pair it with an accessible busy state). */
export function Skeleton({ width = "100%", height = "1rem", className }: SkeletonProps) {
  return <span aria-hidden="true" className={[styles.skeleton, className].filter(Boolean).join(" ")} style={{ width, height }} />;
}
