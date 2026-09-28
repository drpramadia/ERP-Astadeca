"use client";

/*
 * Motion primitives.
 *
 * One small vocabulary of entrances so pages animate consistently
 * instead of each screen inventing its own timing. Everything is
 * transform/opacity only — no layout-affecting animation, so the
 * operational tables never jitter while data loads.
 *
 * Durations stay in the 200–600ms band: long enough to read as
 * intentional, short enough that an operator clicking through
 * screens never waits on the animation.
 */

import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- */
/* Easing + shared variants                                          */
/* ---------------------------------------------------------------- */

const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;

export const staggerParent: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: EASE_PREMIUM },
  },
};

/* ---------------------------------------------------------------- */
/* PageTransition — wraps a route's content                          */
/* ---------------------------------------------------------------- */

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_PREMIUM }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- */
/* Reveal — scroll-triggered entrance                                */
/* ---------------------------------------------------------------- */

export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.5, ease: EASE_PREMIUM, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- */
/* Stagger — parent/child list orchestration                         */
/* ---------------------------------------------------------------- */

export function Stagger({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      animate="show"
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & HTMLMotionProps<"div">) {
  return (
    <motion.div className={className} variants={staggerChild} {...props}>
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- */
/* MotionCard — hover lift with brand-tinted shadow                  */
/* ---------------------------------------------------------------- */

export function MotionCard({
  children,
  className,
  lift = 3,
}: {
  children: ReactNode;
  className?: string;
  lift?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={cn("relative", className)}
      whileHover={
        reduced
          ? undefined
          : {
              y: -lift,
              boxShadow:
                "0 4px 8px rgb(15 30 38 / 6%), 0 24px 56px -12px rgb(9 62 68 / 18%)",
            }
      }
      transition={{ duration: 0.24, ease: EASE_PREMIUM }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- */
/* CountUp — animates an operational figure into place               */
/* ---------------------------------------------------------------- */

export function CountUp({
  value,
  duration = 1.1,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  locale = "id-ID",
}: {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  locale?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(() => (reduced ? value : 0));

  useEffect(() => {
    if (reduced || !inView) return;

    const controls = animate(0, value, {
      duration,
      ease: EASE_PREMIUM,
      onUpdate: (latest) => setDisplay(latest),
    });

    return () => controls.stop();
  }, [inView, value, duration, reduced]);

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(reduced ? value : display);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* AnimatedNumber — convenience wrapper for currency-shaped figures   */
/* ---------------------------------------------------------------- */

export function AnimatedNumber({
  value,
  className,
  compact = false,
}: {
  value: number;
  className?: string;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(() => (reduced ? value : 0));

  useEffect(() => {
    if (reduced || !inView) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: EASE_PREMIUM,
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [inView, value, reduced]);

  const current = reduced ? value : display;
  const formatted = compact
    ? new Intl.NumberFormat("id-ID", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(current)
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(
        current
      );

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {formatted}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* AnimatedBar — horizontal progress / share indicator               */
/* ---------------------------------------------------------------- */

export function AnimatedBar({
  value,
  max = 100,
  className,
  barClassName,
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}) {
  const reduced = useReducedMotion();
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-[#e6eeee]",
        className
      )}
    >
      <motion.div
        className={cn(
          "h-full rounded-full bg-gradient-to-r from-primary to-[#2fa6a0]",
          barClassName
        )}
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: EASE_PREMIUM }}
      />
    </div>
  );
}
