"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

interface CompanySettings {
  name: string;
  legal_name: string | null;
  code: string | null;
  tax_id: string | null;
  address: string | null;
}

interface StructureItem {
  id: string;
  code: string;
  name: string;
}

const settingKeys = ["TAX_PERCENTAGE", "CURRENCY"] as const;

export default function SettingsPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [businessUnits, setBusinessUnits] = useState<StructureItem[]>([]);
  const [warehouses, setWarehouses] = useState<StructureItem[]>([]);
  const [coldStorages, setColdStorages] = useState<StructureItem[]>([]);
  const [taxRate, setTaxRate] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk membuka pengaturan.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        const [organizationResult, businessResult, warehouseResult, storageResult, settingsResult, permissionResult] = await Promise.all([
          supabase.from("organizations").select("name, legal_name, code, tax_id, address").eq("id", membership.organization_id).single(),
          supabase.from("business_units").select("id, code, name").eq("organization_id", membership.organization_id).eq("active", true).order("name"),
          supabase.from("warehouses").select("id, code, name").eq("organization_id", membership.organization_id).eq("active", true).order("name"),
          supabase.from("cold_storages").select("id, code, name").eq("organization_id", membership.organization_id).eq("status", "ACTIVE").order("code"),
          supabase.from("organization_settings").select("setting_key, setting_value").eq("organization_id", membership.organization_id).in("setting_key", [...settingKeys]),
          supabase.rpc("has_org_permission", { p_org_id: membership.organization_id, p_permission_code: "admin.settings" }),
        ]);
        const failed = [organizationResult, businessResult, warehouseResult, storageResult, permissionResult].find((result) => result.error);
        if (failed?.error) throw failed.error;
        // organization_settings table may not exist yet — use empty defaults
        const savedSettings = new Map((settingsResult?.data || []).map((setting) => [setting.setting_key, setting.setting_value]));
        if (!cancelled) {
          setOrganizationId(membership.organization_id);
          setCompany(organizationResult.data as CompanySettings);
          setBusinessUnits((businessResult.data || []) as StructureItem[]);
          setWarehouses((warehouseResult.data || []) as StructureItem[]);
          setColdStorages((storageResult.data || []) as StructureItem[]);
          const savedTax = savedSettings.get("TAX_PERCENTAGE");
          const savedCurrency = savedSettings.get("CURRENCY");
          setTaxRate(savedTax === undefined ? "" : String(savedTax));
          setCurrency(savedCurrency ? String(savedCurrency).replaceAll('"', "") : "IDR");
          setCanManage(Boolean(permissionResult.data));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat pengaturan.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("Fitur menyimpan pengaturan belum tersedia — tabel organization_settings belum dibuat.");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="SISTEM" title="Pengaturan" description="Profil organisasi dan konfigurasi operasional yang tersedia pada schema saat ini." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {isLoading ? <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat pengaturan...</div> : company ? <div className="grid gap-8 lg:grid-cols-2">
          <section className="border-b border-line pb-6 lg:border-b-0"><h2 className="text-lg font-semibold text-ink">Company</h2><dl className="mt-4 grid gap-3">{[["Nama", company.name], ["Nama legal", company.legal_name], ["Kode", company.code], ["NPWP", company.tax_id], ["Alamat", company.address]].map(([label, value]) => <div key={label} className="border-b border-line pb-2"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-ink">{value || "-"}</dd></div>)}</dl><p className="mt-3 text-xs text-slate-500">Profil organization hanya memiliki kebijakan baca pada schema saat ini.</p></section>
          <section className="border-b border-line pb-6 lg:border-b-0"><h2 className="text-lg font-semibold text-ink">Konfigurasi keuangan</h2><form onSubmit={(event) => void saveSettings(event)} className="mt-4 space-y-4"><Input label="Tax percentage" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} disabled={!canManage} required /><Select label="Currency" options={[{ value: "IDR", label: "IDR - Rupiah" }, { value: "USD", label: "USD - US Dollar" }, { value: "SGD", label: "SGD - Singapore Dollar" }, { value: "EUR", label: "EUR - Euro" }]} value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={!canManage} /><Button type="submit" disabled={!canManage}>Simpan pengaturan</Button>{!canManage && <p className="text-xs text-slate-500">Perubahan membutuhkan permission `admin.settings`.</p>}</form></section>
          <section><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-ink">Business Unit</h2><Link className="text-sm text-primary hover:underline" href="/master-data/warehouses">Kelola master</Link></div><p className="mt-1 text-sm text-slate-500">{businessUnits.length} unit aktif</p>{businessUnits.map((item) => <p key={item.id} className="border-b border-line py-2 text-sm">{item.code} · {item.name}</p>)}</section>
          <section><h2 className="text-lg font-semibold text-ink">Warehouse & Cold Storage</h2><p className="mt-1 text-sm text-slate-500">{warehouses.length} warehouse · {coldStorages.length} cold storage aktif</p>{warehouses.map((item) => <p key={item.id} className="border-b border-line py-2 text-sm">{item.code} · {item.name}</p>)}<div className="mt-2 flex flex-wrap gap-2">{coldStorages.map((item) => <Link key={item.id} href="/master-data/cold-storage" className="border-b border-line py-2 text-sm text-primary hover:underline">{item.code} · {item.name}</Link>)}</div></section>
          <section className="lg:col-span-2"><h2 className="text-lg font-semibold text-ink">Pengaturan lain</h2><div className="mt-2 grid gap-x-8 sm:grid-cols-3"><p className="border-b border-line py-3 text-sm text-slate-500">Rental rate dikelola melalui domain rental billing.</p><p className="border-b border-line py-3 text-sm text-slate-500">Document numbering memakai fungsi generator pada domain masing-masing.</p><p className="border-b border-line py-3 text-sm text-slate-500">Tax di atas dipakai sebagai master; historical charge tetap immutable.</p></div></section>
        </div> : null}
      </div>
    </AppShell>
  );
}