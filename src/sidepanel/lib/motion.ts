import type { Transition, Variants } from "motion/react";

/*
 * The panel's motion vocabulary. Every animated value in the panel comes from
 * here (CSS mirrors the same numbers as --dur-* / --ease in index.css), so the
 * whole thing reads as one calm system: short, ease-out, never bouncy.
 */

/** Seconds. Hover/press ≈ fast, things appearing ≈ base, screens ≈ slow. */
export const DURATION = { fast: 0.12, base: 0.18, slow: 0.22 } as const;

/** Ease-out (quart-ish): starts responsive, settles quietly. Same curve as CSS --ease. */
export const EASE = [0.25, 1, 0.5, 1] as const;

const t = (duration: number): Transition => ({ duration, ease: EASE });

/**
 * Screens: the old one fades fast (it's popped out of flow, on top); the new
 * one starts half a beat later and rises 4px into place, so the two barely
 * overlap. It's mounted (and focusable) from the first frame either way.
 */
export const screen: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { ...t(DURATION.slow), delay: DURATION.fast / 2 } },
  exit: { opacity: 0, transition: t(DURATION.fast) },
};

/** In-place swaps inside a screen (Now strip ↔ switch prompt). */
export const swap: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: t(DURATION.base) },
  exit: { opacity: 0, transition: t(DURATION.fast) },
};

/** Toasts rise from the bottom edge and sink back out. */
export const toast: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: t(DURATION.base) },
  exit: { opacity: 0, y: 4, transition: t(DURATION.fast) },
};

/**
 * Rows, groups and drawers: grow from zero height so the content below glides
 * instead of jumping. `overflow` is only clipped while moving, so tooltips
 * aren't cut off at rest. With reduced motion, height changes are instant.
 */
export function reveal(reduced: boolean): Variants {
  const d = (s: number) => (reduced ? 0 : s);
  return {
    initial: { height: 0, opacity: 0, overflow: "hidden" },
    animate: {
      height: "auto",
      opacity: 1,
      transition: { height: t(d(DURATION.base)), opacity: t(d(DURATION.fast)) },
      transitionEnd: { overflow: "visible" },
    },
    exit: {
      height: 0,
      opacity: 0,
      overflow: "hidden",
      transition: { height: t(d(DURATION.base)), opacity: t(d(DURATION.fast)) },
    },
  };
}

/** Spread on an `m.*` element to use a variants set by name. */
export const presence = { initial: "initial", animate: "animate", exit: "exit" } as const;
