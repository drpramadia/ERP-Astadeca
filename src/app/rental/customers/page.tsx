"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";

interface RentalCustomer {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number;
  active: boolean;
  is_rental_customer: boolean;
}

interface ContractSummary {
  id: string;
  customer_id: string;
  contract_number: string;
  title: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<RentalCustomer[]>([]);
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [selected, setSelected] = useState<RentalCustomer | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk melihat customer rental.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        const [customerResult, contractResult] = await Promise.all([
          supabase.from("customers").select("id, code, name, contact_person, phone, email, payment_terms_days, active, is_rental_customer").eq("organization_id", membership.organization_id).eq("is_rental_customer", true).order("name"),
          supabase.from("rental_contracts").select("id, customer_id, contract_number, title, status, start_date, end_date").eq("organization_id", membership.organization_id).order("start_date", { ascending: false }),
        ]);
        if (customerResult.error) throw customerResult.error;
        if (contractResult.error) throw contractResult.error;
        if (!cancelled) {
          setCustomers((customerResult.data || []) as RentalCustomer[]);
          setContracts((contractResult.data || []) as ContractSummary[]);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat customer rental.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filteredCustomers = customers.filter((customer) => `${customer.code} ${customer.name} ${customer.contact_person || ""}.toLowerCase().includes(search.toLowerCase()));
  const selectedContracts = contracts.filter((contract) => contract.customer_id === selected?.id);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="COLD STORAGE RENTAL" title="Customer Rental" description="Customer-owned goods, kontak, termin pembayaran, dan kontrak sewa." actions={<Link href="/master-data/customers"><Button>Kelola master customer</Button></Link>} />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-4"><Input aria-label="Cari customer rental" placeholder="Cari kode atau nama customer" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-sm" /><span className="ml-auto text-sm text-slate-500">{filteredCustomers.length} customer</span></div>
        {isLoading ? <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat customer rental...</div> : filteredCustomers.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">Belum ada customer rental yang cocok.</div> : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[720px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600"><th className="px-4 py-3">Kode</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Kontak</th><th className="px-4 py-3">Termin</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-line">{filteredCustomers.map((customer) => <tr key={customer.id}><td className="px-4 py-3 font-mono text-sm">{customer.code}</td><td className="px-4 py-3 text-sm font-medium">{customer.name}</td><td className="px-4 py-3 text-sm">{customer.contact_person || customer.phone || customer.email || "-"}</td><td className="px-4 py-3 text-sm">{customer.payment_terms_days} hari</td><td className="px-4 py-3"><StatusBadge tone={customer.active ? "success" : "neutral"}>{customer.active ? "Aktif" : "Nonaktif"}</StatusBadge></td><td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => setSelected(customer)}>Detail</Button></td></tr>)}</tbody></table></div>
        )}
      </div>
      <Modal isOpen={selected !== null} onClose={() => setSelected(null)} title={selected?.name || "Detail customer"} size="lg">
        {selected && <div className="space-y-5"><dl className="grid gap-3 sm:grid-cols-2">{[["Kode", selected.code], ["Kontak", selected.contact_person || "-"], ["Telepon", selected.phone || "-"], ["Email", selected.email || "-"], ["Termin", `${selected.payment_terms_days} hari`], ["Status", selected.active ? "Aktif" : "Nonaktif"]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-ink">{value}</dd></div>)}</dl><div><h3 className="mb-2 text-sm font-semibold">Kontrak rental</h3>{selectedContracts.length ? <ul className="divide-y divide-line rounded-lg border border-line">{selectedContracts.map((contract) => <li key={contract.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span>{contract.contract_number} · {contract.title}</span><StatusBadge tone={contract.status === "ACTIVE" ? "success" : "neutral"}>{contract.status}</StatusBadge></li>)}</ul> : <p className="text-sm text-slate-500">Belum ada kontrak.</p>}</div><Link href="/master-data/customers" className="inline-flex text-sm font-medium text-primary hover:underline">Buka master customer untuk mengedit</Link></div>}
      </Modal>
    </AppShell>
  );
}
