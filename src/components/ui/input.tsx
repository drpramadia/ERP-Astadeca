"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "block w-full rounded-[10px] border border-line bg-gradient-to-b from-white to-[#fbfdfd] px-3.5 py-2.5 text-sm text-ink shadow-[inset_0_1px_2px_rgb(20_35_43_/_5%),0_1px_0_white] placeholder:text-slate-400 transition-all",
            "focus:border-primary/70 focus:outline-none focus:ring-4 focus:ring-primary/10 focus:shadow-[0_0_0_1px_rgb(8_126_139_/_10%),inset_0_1px_2px_rgb(20_35_43_/_4%)]",
            "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
            error && "border-danger focus:border-danger focus:ring-danger/20",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
