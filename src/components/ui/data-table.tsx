"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T extends { id?: string }>({
  columns,
  data,
  isLoading,
  emptyMessage = "Tidak ada data",
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className={cn("app-surface overflow-hidden rounded-xl", className)}>
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Memuat data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn("app-surface overflow-hidden rounded-xl border-dashed", className)}>
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="rounded-full bg-slate-100 p-3 mb-3">
            <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">{emptyMessage}</p>
          <p className="text-xs text-slate-500 mt-1">Data akan muncul di sini</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("app-surface overflow-hidden rounded-xl", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line bg-[#f2f6f6]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((row, idx) => (
              <tr
                key={row.id || idx}
                className={cn(
                  "transition-colors odd:bg-white even:bg-[#fbfdfd] hover:bg-primary-soft/45",
                  onRowClick && "cursor-pointer"
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 text-sm text-ink", col.className)}>
                    {col.render
                      ? col.render(row)
                      : (row as Record<string, unknown>)[col.key]?.toString() || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
