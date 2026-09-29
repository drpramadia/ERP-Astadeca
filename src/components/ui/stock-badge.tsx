interface StockBadgeProps {
  available: number;
  minimum?: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const DEFAULT_MIN = 10;

export function StockBadge({ available, minimum = DEFAULT_MIN, showLabel = false, size = "sm" }: StockBadgeProps) {
  let tone = "bg-emerald-100 text-emerald-700";
  let icon = null;
  let label = "Tersedia";

  if (available === 0) {
    tone = "bg-red-100 text-red-700";
    label = "Habis";
    icon = (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  } else if (available < minimum || available <= 5) {
    tone = "bg-amber-100 text-amber-700";
    label = "Menipis";
    icon = (
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  }

  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-xs px-2 py-1 gap-1.5";

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${tone} ${sizeClass}`} title={`Stok: ${available}${minimum > 0 ? ` / Min: ${minimum}` : ""}`}>
      {icon}
      {showLabel ? label : available.toLocaleString("id-ID")}
    </span>
  );
}
