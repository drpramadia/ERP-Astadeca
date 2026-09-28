import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  description?: string;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
  };
  icon?: ReactNode;
  className?: string;
}

export function KpiCard({
  label,
  value,
  unit,
  description,
  trend,
  icon,
  className = "",
}: KpiCardProps) {
  return (
    <div className={`app-surface relative overflow-hidden rounded-xl p-5 ${className}`}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-[#41a9a2] to-accent" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-500 truncate">{label}</p>
          <div className="flex items-baseline gap-1.5 mt-2">
            <p className="font-display text-[30px] font-semibold leading-none text-ink tabular">
              {typeof value === "number" ? value.toLocaleString("id-ID") : value}
            </p>
            {unit && <span className="text-sm text-slate-500">{unit}</span>}
          </div>
          {description && (
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
              trend.direction === "up" ? "text-emerald-600" :
              trend.direction === "down" ? "text-rose-600" : "text-slate-500"
            }`}>
              {trend.direction === "up" && (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              )}
              {trend.direction === "down" && (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
              <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-slate-100 p-2.5 text-slate-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
