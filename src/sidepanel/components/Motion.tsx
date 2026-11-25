import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { LazyMotion, MotionConfig, m, useIsPresent, useReducedMotion } from "motion/react";
import { presence, reveal, screen } from "../lib/motion";

const loadFeatures = () => import("../lib/motionFeatures").then((mod) => mod.default);

/**
 * Motion for the whole panel. LazyMotion + `m.*` keeps the first paint small:
 * the domAnimation engine loads as its own chunk right after (`strict` throws
 * if a full `motion.*` component sneaks in and defeats that). Until it lands
 * nothing animates, which is fine: the first screen doesn't animate anyway.
 * reducedMotion="user" drops transforms when the OS asks for less motion.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}

/** While animating out, an element can't be clicked, focused or found by assistive tech. */
function useLeaving() {
  const leaving = !useIsPresent();
  return { inert: leaving || undefined, "aria-hidden": leaving || undefined } as const;
}

function setRefs<T>(el: T | null, ...refs: (Ref<T> | undefined)[]) {
  for (const r of refs) {
    if (typeof r === "function") r(el);
    else if (r) r.current = el;
  }
}

/**
 * One panel screen. When it replaces another and focus was left behind on the
 * old one, focus moves to this screen's heading (without scrolling), so
 * keyboard and screen-reader users land at the top of what just appeared.
 */
export function Screen({ children, focusOnEnter, ref }: { children: ReactNode; focusOnEnter: boolean; ref?: Ref<HTMLDivElement> }) {
  const own = useRef<HTMLDivElement | null>(null);
  const leaving = useLeaving();

  useEffect(() => {
    if (!focusOnEnter) return;
    const active = document.activeElement;
    // An autoFocus field already took focus: leave it there.
    if (active && active !== document.body && !active.closest("[inert]")) return;
    const target = own.current?.querySelector<HTMLElement>("h2") ?? own.current?.querySelector<HTMLElement>("button");
    if (!target) return;
    if (target.tagName === "H2") {
      target.tabIndex = -1;
      target.dataset.screenHeading = "";
    }
    target.focus({ preventScroll: true });
    // Once per screen, on mount: focusOnEnter is fixed for a screen's lifetime.
  }, []);

  return (
    <m.div ref={(el: HTMLDivElement | null) => setRefs(el, own, ref)} className="screen" variants={screen} {...presence} {...leaving}>
      {children}
    </m.div>
  );
}

/**
 * Grows in from zero height and shrinks back out, so what's below glides
 * instead of jumping. Used for task rows, task groups and the drawers.
 */
export function Reveal({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const reduced = useReducedMotion() ?? false;
  const leaving = useLeaving();
  return (
    <m.div id={id} className={className} variants={reduced ? REVEAL_INSTANT : REVEAL} {...presence} {...leaving}>
      {children}
    </m.div>
  );
}
const REVEAL = reveal(false);
const REVEAL_INSTANT = reveal(true);

/** A fading slot whose old content steps out of the way (use under AnimatePresence mode="popLayout"). */
export function Swap({ children, variants, className, ref }: { children: ReactNode; variants: typeof screen; className?: string; ref?: Ref<HTMLDivElement> }) {
  const leaving = useLeaving();
  return (
    <m.div ref={ref} className={className} variants={variants} {...presence} {...leaving}>
      {children}
    </m.div>
  );
}
