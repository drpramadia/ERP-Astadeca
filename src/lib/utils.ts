import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "IDR"): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("id-ID").format(num);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatKg(kg: number): string {
  return `${formatNumber(kg)} KG`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getBadgeTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  const statusLower = status.toLowerCase();
  if (statusLower.includes("active") || statusLower.includes("approved") || statusLower.includes("completed") || statusLower.includes("paid") || statusLower.includes("delivered") || statusLower.includes("received")) return "success";
  if (statusLower.includes("pending") || statusLower.includes("draft") || statusLower.includes("submitted") || statusLower.includes("in_progress") || statusLower.includes("in_transit")) return "warning";
  if (statusLower.includes("cancelled") || statusLower.includes("rejected") || statusLower.includes("failed") || statusLower.includes("quarantine") || statusLower.includes("blocked")) return "danger";
  if (statusLower.includes("info")) return "info";
  return "neutral";
}

export function getDaysUntilExpiry(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getExpiryStatus(expiryDate: string | null | undefined): "danger" | "warning" | "neutral" {
  const days = getDaysUntilExpiry(expiryDate);
  if (days === null) return "neutral";
  if (days <= 0) return "danger";
  if (days <= 30) return "warning";
  return "neutral";
}
