"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <label className={`inline-flex items-center gap-2 cursor-pointer ${props.disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}>
        <input
          ref={ref}
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
          {...props}
        />
        {label && <span className="text-sm text-ink">{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
