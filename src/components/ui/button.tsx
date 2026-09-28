"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-[#086b76] bg-gradient-to-b from-[#1697a0] via-primary to-[#08717c] text-white shadow-[0_4px_0_#075762,0_8px_16px_rgb(8_126_139_/_18%),inset_0_1px_0_rgb(255_255_255_/_30%)] hover:shadow-[0_5px_0_#075762,0_10px_18px_rgb(8_126_139_/_22%),inset_0_1px_0_rgb(255_255_255_/_34%)] active:translate-y-[3px] active:shadow-[0_1px_0_#075762,0_3px_6px_rgb(8_126_139_/_16%)]",
  secondary: "border-[#d5e0e2] bg-gradient-to-b from-white to-[#f2f6f6] text-ink shadow-[0_3px_0_#d7e1e1,0_6px_12px_rgb(20_35_43_/_7%),inset_0_1px_0_white] hover:border-[#b9cccc] hover:shadow-[0_4px_0_#d7e1e1,0_8px_14px_rgb(20_35_43_/_9%),inset_0_1px_0_white] active:translate-y-[2px] active:shadow-[0_1px_0_#d7e1e1,0_3px_6px_rgb(20_35_43_/_6%)]",
  danger: "border-[#a62e3d] bg-gradient-to-b from-[#ef6470] via-danger to-[#bf3445] text-white shadow-[0_4px_0_#9d2c3a,0_8px_16px_rgb(214_69_69_/_18%),inset_0_1px_0_rgb(255_255_255_/_28%)] hover:shadow-[0_5px_0_#9d2c3a,0_10px_18px_rgb(214_69_69_/_22%),inset_0_1px_0_rgb(255_255_255_/_32%)] active:translate-y-[3px] active:shadow-[0_1px_0_#9d2c3a,0_3px_6px_rgb(214_69_69_/_16%)]",
  ghost: "border-transparent bg-transparent text-ink hover:border-line hover:bg-white/80 hover:shadow-[0_2px_5px_rgb(20_35_43_/_7%)] active:translate-y-px",
  outline: "border-line bg-white text-ink shadow-sm hover:border-slate-300 hover:bg-slate-50 active:translate-y-px",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "button-lift inline-flex items-center justify-center rounded-[10px] border font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Spinner size={size === "sm" ? 14 : 16} />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
