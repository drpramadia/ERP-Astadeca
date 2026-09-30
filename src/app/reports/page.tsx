"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatNumber } from "@/lib/utils";

type ReportKind = "inventory" | "movements" | "expiry" | "rental" | "revenue";
type ReportRow = Record<string, unknown>;

const reportOptions = [
  { value: "inventory", label: "Inventory" },
  { value: "movements", label: "Stock movement" },
  { value: "expiry", label: "Expiry" },
  { value: "rental", label: "Rental allocations" },
  { value: "revenue", label: "Rental revenue" },
];

function getNestedValue(obj: unknown, path: string): unknown {
  // e.g. "products.name" -> obj.products.name
  if (typeof path !== "string") return undefined;
  return path.split(".").reduce((curr: unknown, key: string) => {
    if (curr === null || curr === undefined) return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function formatCell(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return formatNumber(value);
  // Dot-notation key: value is the root object, key is e.g. "products.name"
  if (key.includes(".")) {
    const nested = getNestedValue(value, key.split(".").slice(1).join("."));
    if (nested === null || nested === undefined || nested === "") return "—";
    if (typeof nested === "boolean") return nested ? "Ya" : "Tidak";
    if (typeof nested === "number") return formatNumber(nested);
    if (typeof nested === "string" && /(date|at|expiry|start|end)/i.test(key) && !Number.isNaN(Date.parse(nested))) return formatDate(nested);
    return String(nested);
  }
  if (typeof value === "string" && /(date|at|expiry|start|end)/i.test(key) && !Number.isNaN(Date.parse(value))) return formatDate(value);
  return String(value);
}

export default function ReportsPage() {
  const [report, setReport] = useState<ReportKind>("inventory");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        let orgId = organizationId;
        if (!orgId) {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData?.session?.user?.id;
          if (!userId) throw new Error("Silakan login untuk melihat laporan.");
          const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", "true").maybeSingle();
          if (membershipError) throw membershipError;
          if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
          orgId = membership.organization_id;
          setOrganizationId(orgId);
        }

        let result;
        if (report === "inventory") {
          result = await supabase.from("inventory").select("id, owner_type, status, quantity, quantity_kg, received_at, products(name, sku), batches(batch_number, expiry_date), cold_storages(code), storage_locations(code), units(code)").eq("organization_id", orgId).order("received_at", { ascending: false }).limit(500);
        } else if (report === "movements") {
          result = await supabase.from("inventory_movements").select("id, movement_number, movement_type, quantity, quantity_kg, performed_at, reason, reference_number, products(name, sku), batches(batch_number)").eq("organization_id", orgId).order("performed_at", { ascending: false }).limit(500);
        } else if (report === "expiry") {
          result = await supabase.from("inventory").select("id, quantity_kg, status, batches(batch_number, expiry_date, products(name, sku)), cold_storages(code), storage_locations(code)").eq("organization_id", orgId).not("batches.expiry_date", "is", null).order("created_at", { ascending: false }).limit(500);
        } else if (report === "rental") {
          result = await supabase.from("rental_allocations").select("id, allocation_number, allocated_quantity_kg, active_quantity_kg, released_quantity_kg, status, customers(name), products(name, sku), batches(batch_number), cold_storages(code), storage_locations(code), rental_contracts(contract_number)").eq("organization_id", orgId).order("allocated_at", { ascending: false }).limit(500);
        } else {
          result = await supabase.from("rental_charges").select("id, charge_number, billing_start, billing_end, quantity_kg_average, days_billed, rate_per_kg_day, subtotal, tax_amount, total_amount, currency, status, customers(name), rental_contracts(contract_number)").eq("organization_id", orgId).order("billing_start", { ascending: false }).limit(500);
        }
        if (result.error) throw result.error;
        if (!cancelled) setRows((result.data || []) as unknown as ReportRow[]);
      } catch (loadError) {
        if (!cancelled) {
          setRows([]);
          setError(loadError instanceof Error ? loadError.message : "Laporan belum dapat dimuat dari database.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [report, organizationId]);

  // Supabase embed returns nested objects; flatten one level so {products:{name,x},batches:{batch_number,y}}
  // becomes "products.name","batches.batch_number","batches.expiry_date" as separate columns.
  // Objects that are arrays (e.g. products: [{}]) are skipped — they should be handled by a dedicated renderer.
  const columns = rows.length
    ? Object.entries(rows[0] as Record<string, unknown>)
        .filter(([k]) => !["id", "organization_id"].includes(k))
        .flatMap(([k, v]) => {
          if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            return Object.entries(v as Record<string, unknown>).map(
              ([nk]) => `${k}.${nk}`
            );
          }
          return [k];
        })
    : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="ANALITIK OPERASIONAL" title="Laporan" description="Laporan berasal dari record database aktif; gunakan print browser untuk menyimpan hasil sebagai PDF." actions={<Button variant="secondary" onClick={() => window.print()}>Cetak / PDF</Button>} />
        <div className="mb-5 flex max-w-md items-end gap-3 border-b border-line pb-4"><Select label="Jenis laporan" options={reportOptions} value={report} onChange={(event) => setReport(event.target.value as ReportKind)} /><span className="pb-2 text-sm text-slate-500">{rows.length} baris</span></div>
        {error && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-medium">Laporan belum tersedia</p><p className="mt-1">{error}</p></div>}
        {isLoading ? <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat laporan...</div> : !error && rows.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">Tidak ada data untuk laporan ini.</div> : rows.length > 0 ? (
          <div className="table-scroll rounded-xl border border-line bg-white"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">{columns.map((column) => <th key={column} className="px-4 py-3">{column.replaceAll("_", " ").replace(/\./g, " › ")}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map((row, index) => <tr key={String(row.id || index)}>{columns.map((column) => <td key={column} className="max-w-64 px-4 py-3 text-sm text-ink">{formatCell(column, getNestedValue(row, column))}</td>)}</tr>)}</tbody></table></div>
        ) : null}
      </div>
    </AppShell>
  );
}