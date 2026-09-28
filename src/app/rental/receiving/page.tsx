"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatNumber } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
  code?: string;
  customer_id?: string;
  product_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string | null;
  unit_id?: string;
}

interface ContractOption {
  id: string;
  contract_number: string;
  title: string;
  customer_id: string;
}

interface LocationOption extends Option {
  cold_storage_id: string;
}

interface Receipt {
  id: string;
  movement_number: string;
  movement_type: string;
  quantity_kg: number;
  performed_at: string;
  customers: { name: string } | null;
  products: { name: string } | null;
  batches: { batch_number: string } | null;
}

const emptyForm = {
  contractId: "", productId: "", storageId: "", locationId: "", unitId: "",
  quantity: "", batchNumber: "", productionDate: "", expiryDate: "", notes: "",
};

export default function RentalReceivingPage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [storages, setStorages] = useState<Option[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(organization: string, userId: string) {
    const supabase = createClient();
    const [customerResult, contractResult, productResult, storageResult, locationResult, unitResult, receiptResult] = await Promise.all([
      supabase.from("customers").select("id, name, code").eq("organization_id", organization).eq("active", true).eq("is_rental_customer", true).order("name"),
      supabase.from("rental_contracts").select("id, contract_number, title, customer_id, status, start_date, end_date").eq("organization_id", organization).eq("status", "ACTIVE").order("contract_number"),
      supabase.from("products").select("id, name, sku, unit_id").eq("organization_id", organization).eq("active", true).order("name"),
      supabase.from("cold_storages").select("id, name, code").eq("organization_id", organization).eq("status", "ACTIVE").order("code"),
      supabase.from("storage_locations").select("id, name, code, cold_storage_id").eq("organization_id", organization).eq("active", true).order("code"),
      supabase.from("units").select("id, name, code").eq("organization_id", organization).eq("active", true).order("code"),
      supabase.from("rental_stock_movements").select("id, movement_number, movement_type, quantity_kg, performed_at, customers(name), products(name), batches(batch_number)").eq("organization_id", organization).eq("movement_type", "RECEIVE").order("performed_at", { ascending: false }).limit(30),
    ]);
    const failed = [customerResult, contractResult, productResult, storageResult, locationResult, unitResult, receiptResult].find((result) => result.error);
    if (failed?.error) throw failed.error;
    setOrganizationId(organization);
    setActorId(userId);
    setCustomers((customerResult.data || []) as Option[]);
    setContracts((contractResult.data || []) as ContractOption[]);
    setProducts((productResult.data || []) as Option[]);
    setStorages((storageResult.data || []) as Option[]);
    setLocations((locationResult.data || []) as LocationOption[]);
    setUnits((unitResult.data || []) as Option[]);
    setReceipts((receiptResult.data || []) as unknown as Receipt[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = claimsData?.claims?.sub;
        if (!userId) throw new Error("Silakan login untuk menerima stok rental.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        await load(membership.organization_id, userId);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat data penerimaan.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const selectedContract = contracts.find((contract) => contract.id === form.contractId);
  const selectedProduct = products.find((product) => product.id === form.productId);
  const customer = customers.find((item) => item.id === selectedContract?.customer_id);
  const filteredLocations = locations.filter((location) => location.cold_storage_id === form.storageId);

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !actorId || !selectedContract || !selectedProduct) return;
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Jumlah harus lebih besar dari nol.");
      return;
    }
    if (!form.batchNumber.trim() || !form.storageId || !form.locationId || !form.unitId) {
      setError("Batch, cold storage, lokasi, dan satuan wajib diisi.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data: existingBatch, error: batchLookupError } = await supabase.from("batches").select("id").eq("organization_id", organizationId).eq("product_id", selectedProduct.id).eq("batch_number", form.batchNumber.trim()).maybeSingle();
      if (batchLookupError) throw batchLookupError;
      let batchId = existingBatch?.id;
      if (!batchId) {
        const { data: newBatch, error: createBatchError } = await supabase.from("batches").insert({
          organization_id: organizationId,
          product_id: selectedProduct.id,
          batch_number: form.batchNumber.trim(),
          received_date: new Date().toISOString().slice(0, 10),
          production_date: form.productionDate || null,
          expiry_date: form.expiryDate || null,
        }).select("id").single();
        if (createBatchError) throw createBatchError;
        batchId = newBatch.id;
      }

      const { data: receipt, error: receiveError } = await supabase.rpc("receive_rental_stock", {
        p_organization_id: organizationId,
        p_contract_id: selectedContract.id,
        p_customer_id: selectedContract.customer_id,
        p_product_id: selectedProduct.id,
        p_batch_id: batchId,
        p_cold_storage_id: form.storageId,
        p_storage_location_id: form.locationId,
        p_quantity: quantity,
        p_quantity_kg: quantity,
        p_unit_id: form.unitId,
        p_reference_number: `RNT-RCV-${Date.now()}`,
        p_notes: form.notes || null,
        p_performed_by: actorId,
      });
      if (receiveError) throw receiveError;
      const result = receipt?.[0];
      setMessage(result?.message || `Penerimaan ${formatNumber(quantity)} KG tersimpan sebagai inventory milik customer.`);
      setForm(emptyForm);
      await load(organizationId, actorId);
    } catch (receiveError) {
      setError(receiveError instanceof Error ? receiveError.message : "Penerimaan gagal disimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="COLD STORAGE RENTAL" title="Penerimaan Rental" description="Catat stok customer-owned melalui kontrak, allocation, inventory, snapshot, dan movement rental." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        <form onSubmit={(event) => void receive(event)} className="space-y-5 border-b border-line pb-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Select label="Kontrak aktif" required options={[{ value: "", label: "Pilih kontrak" }, ...contracts.map((item) => ({ value: item.id, label: `${item.contract_number} · ${item.title}` }))]} value={form.contractId} onChange={(event) => setForm((current) => ({ ...current, contractId: event.target.value }))} disabled={isLoading} />
            <Select label="Produk" required options={[{ value: "", label: "Pilih produk" }, ...products.map((item) => ({ value: item.id, label: `${item.code || ""} ${item.name}`.trim() }))]} value={form.productId} onChange={(event) => { const item = products.find((product) => product.id === event.target.value); setForm((current) => ({ ...current, productId: event.target.value, unitId: item?.unit_id || current.unitId })); }} />
            <Select label="Customer" options={[{ value: customer?.id || "", label: customer?.name || "Mengikuti kontrak" }]} value={customer?.id || ""} disabled />
            <Select label="Cold storage" required options={[{ value: "", label: "Pilih cold storage" }, ...storages.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} value={form.storageId} onChange={(event) => setForm((current) => ({ ...current, storageId: event.target.value, locationId: "" }))} />
            <Select label="Lokasi" required options={[{ value: "", label: "Pilih lokasi" }, ...filteredLocations.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} value={form.locationId} onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))} disabled={!form.storageId} />
            <Input label="Jumlah (KG)" required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
            <Select label="Satuan inventory" required options={[{ value: "", label: "Pilih satuan KG" }, ...units.filter((item) => item.code === "KG").map((item) => ({ value: item.id, label: item.code || item.name }))]} value={form.unitId} onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value }))} />
            <Input label="Batch / lot" required value={form.batchNumber} onChange={(event) => setForm((current) => ({ ...current, batchNumber: event.target.value }))} />
            <Input label="Tanggal produksi" type="date" value={form.productionDate} onChange={(event) => setForm((current) => ({ ...current, productionDate: event.target.value }))} />
            <Input label="Tanggal kedaluwarsa" type="date" value={form.expiryDate} onChange={(event) => setForm((current) => ({ ...current, expiryDate: event.target.value }))} />
          </div>
          <Textarea label="Catatan" rows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          <div className="flex justify-end"><Button type="submit" loading={isSaving} disabled={isLoading || contracts.length === 0}>Simpan penerimaan</Button></div>
        </form>
        <section className="mt-7">
          <div className="mb-3"><h2 className="font-semibold text-ink">Riwayat penerimaan rental</h2><p className="text-sm text-slate-500">Movement terbaru, termasuk batch dan jumlah masuk.</p></div>
          {isLoading ? <div className="py-10 text-center text-sm text-slate-500">Memuat riwayat...</div> : receipts.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">Belum ada penerimaan rental.</div> : (
            <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[680px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600"><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Produk / batch</th><th className="px-4 py-3 text-right">Jumlah KG</th><th className="px-4 py-3">Tanggal</th></tr></thead><tbody className="divide-y divide-line">{receipts.map((receipt) => <tr key={receipt.id}><td className="px-4 py-3 font-mono text-sm">{receipt.movement_number}</td><td className="px-4 py-3 text-sm">{receipt.customers?.name || "-"}</td><td className="px-4 py-3 text-sm">{receipt.products?.name || "-"}<span className="block text-xs text-slate-500">{receipt.batches?.batch_number || "-"}</span></td><td className="px-4 py-3 text-right text-sm font-semibold">{formatNumber(Number(receipt.quantity_kg))}</td><td className="px-4 py-3 text-sm">{formatDate(receipt.performed_at)}</td></tr>)}</tbody></table></div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
